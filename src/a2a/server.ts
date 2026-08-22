import express from 'express';
import {
  DefaultRequestHandler,
  InMemoryTaskStore,
  DefaultExecutionEventBusManager,
} from '@a2a-js/sdk/server';
import {
  agentCardHandler,
  jsonRpcHandler,
  restHandler,
  UserBuilder,
} from '@a2a-js/sdk/server/express';
import type { AgentCard } from '@a2a-js/sdk';
import { discoverPlugins, flattenTools } from '../bridge/loader.js';
import { runWithLoop } from '../loop/runner.js';
import { CostGovernor } from '../cost/governor.js';

/**
 * Real A2A Protocol v1.0 server (official @a2a-js/sdk):
 * every DSH plugin tool is exposed as an agent skill.
 * Message text protocol: JSON {"tool": "<plugin>.<tool>", "input_data": "..."}
 * or bare "<plugin>.<tool>: <input>" or plain text (routed to first tool).
 */

class DshAgentExecutor {
  private tools = new Map<
    string,
    { handler: ((i: string) => Promise<string>) | null; plugin: string }
  >();
  private order: string[] = [];
  private governor = new CostGovernor();

  async init(): Promise<void> {
    const { plugins } = await discoverPlugins();
    for (const t of flattenTools(plugins)) {
      this.tools.set(t.fqName, { handler: t.handler, plugin: t.plugin });
      this.order.push(t.fqName);
    }
  }

  private route(text: string): { tool: string; input: string } | null {
    try {
      const j = JSON.parse(text) as { tool?: string; input_data?: string };
      if (j.tool && this.tools.has(j.tool)) {
        return { tool: j.tool, input: j.input_data ?? '' };
      }
      if (!j.tool && typeof j.input_data === 'string' && this.order.length) {
        return { tool: this.order[0], input: j.input_data };
      }
    } catch {
      /* not json */
    }
    const m = text.match(/^\s*([\w.-]+\.[\w.-]+?)\s*[:：]\s*([\s\S]+)$/);
    if (m && this.tools.has(m[1])) return { tool: m[1], input: m[2] };
    if (this.order.length) return { tool: this.order[0], input: text };
    return null;
  }

  async execute(requestContext: any, eventBus: any): Promise<void> {
    const userText =
      requestContext.userMessage?.parts
        ?.map((p: any) =>
          p?.content?.$case === 'text'
            ? String(p.content.value ?? '')
            : typeof p?.text === 'string'
              ? p.text
              : '',
        )
        .join('') ?? '';
    const taskId = requestContext.taskId as string;
    const contextId = requestContext.contextId as string;

    eventBus.publish({
      kind: 'task',
      data: {
        id: taskId,
        contextId,
        status: { state: 2, message: undefined, timestamp: new Date().toISOString() },
        artifacts: [],
        history: [],
      },
    });

    let output: string;
    let toolName = 'error';
    const routed = this.route(userText);
    const entry = routed ? this.tools.get(routed.tool) : undefined;

    if (!routed || !entry || !entry.handler) {
      output = routed
        ? `Tool ${routed.tool} is not executable on this server.`
        : 'No tools registered.';
    } else {
      toolName = routed.tool;
      try {
        this.governor.charge({
          userKey: String(requestContext.context?.user?.id ?? 'a2a-client'),
          pluginKey: entry.plugin,
          texts: [routed.input],
        });
        const r = await runWithLoop((attempt) => {
          const suffix =
            attempt === 0 ? '' : `\n[fallback-${attempt}] 输出需结构化并含免责声明。`;
          return entry.handler!(routed.input + suffix);
        });
        output = r.output;
      } catch (e) {
        output = `Execution error: ${String(e)}`;
      }
    }

    eventBus.publish({
      kind: 'artifactUpdate',
      data: {
        taskId,
        contextId,
        append: false,
        lastChunk: true,
        metadata: undefined,
        artifact: {
          artifactId: `${taskId}-result`,
          name: toolName,
          description: `Result of ${toolName}`,
          parts: [{ content: { $case: 'text', value: output } }],
          metadata: undefined,
          extensions: [],
        },
      },
    });

    eventBus.publish({
      kind: 'statusUpdate',
      data: {
        taskId,
        contextId,
        status: { state: 3, message: undefined, timestamp: new Date().toISOString() },
        metadata: undefined,
      },
    });
    eventBus.finished();
  }

  async cancelTask(taskId: string, eventBus: any): Promise<void> {
    eventBus.publish({
      kind: 'statusUpdate',
      data: {
        taskId,
        contextId: taskId,
        status: { state: 5, message: undefined, timestamp: new Date().toISOString() },
        metadata: undefined,
      },
    });
    eventBus.finished();
  }
}

export async function startA2AServer(port = 41241): Promise<void> {
  const executor = new DshAgentExecutor();
  await executor.init();

  const { plugins } = await discoverPlugins();
  const agentCard: AgentCard = {
    name: 'dsh-plugin-agent',
    description: `DSH toolkit agent exposing ${plugins.length} plugins via A2A v1.0`,
    version: '2.0.0',
    provider: { organization: 'DSH Toolkit', url: 'https://github.com/dsh-toolkit' },
    supportedInterfaces: [
      {
        url: `http://localhost:${port}/`,
        protocolBinding: 'JSONRPC',
        protocolVersion: '1.0',
        tenant: '',
      },
    ],
    capabilities: {
      streaming: false,
      pushNotifications: false,
      extensions: [],
    },
    defaultInputModes: ['text/plain'],
    defaultOutputModes: ['text/markdown'],
    securitySchemes: {},
    securityRequirements: [],
    signatures: [],
    skills: flattenTools(plugins).map((t) => ({
      id: t.fqName,
      name: t.tool,
      description:
        t.description || `Invoke ${t.tool} - message JSON: {"tool":"${t.fqName}","input_data":"..."}`,
      tags: [t.plugin, 'dsh'],
      examples: [`{"tool":"${t.fqName}","input_data":"your payload"}`],
      inputModes: ['text/plain'],
      outputModes: ['text/markdown'],
      securityRequirements: [],
    })),
  };

  const requestHandler = new DefaultRequestHandler(
    agentCard,
    new InMemoryTaskStore(),
    {
      execute: (ctx, bus) => executor.execute(ctx, bus),
      cancelTask: (id, bus) => executor.cancelTask(id, bus),
    },
    new DefaultExecutionEventBusManager(),
  );

  const app = express();
  app.use(express.json());
  app.use(agentCardHandler({ agentCardProvider: async () => agentCard }));
  app.use(jsonRpcHandler({ requestHandler, userBuilder: UserBuilder.noAuthentication }));
  app.use(restHandler({ requestHandler, userBuilder: UserBuilder.noAuthentication }));

  app.listen(port, () => {
    console.error(`[dsh] A2A v1.0 server on http://localhost:${port}/`);
    console.error(`[dsh] AgentCard: http://localhost:${port}/.well-known/agent-card.json`);
    console.error(`[dsh] ${agentCard.skills.length} skills registered`);
  });
}
