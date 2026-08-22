import * as readline from 'node:readline';
import { discoverPlugins, flattenTools } from './loader.js';
import type { DiscoveredTool } from '../types.js';

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id?: number | string;
  method: string;
  params?: Record<string, unknown>;
}

const UNIFORM_INPUT_SCHEMA = {
  type: 'object',
  properties: {
    input_data: { type: 'string', description: 'Unified string input contract' },
  },
  required: ['input_data'],
};

export const SERVER_INFO = { name: 'dsh-mcp-bridge', version: '1.0.0' };

function toolManifest(tool: DiscoveredTool) {
  return {
    name: tool.fqName,
    description:
      tool.description ||
      `Tool ${tool.tool} provided by DSH plugin ${tool.plugin}`,
    inputSchema: UNIFORM_INPUT_SCHEMA,
  };
}

export async function startMcpBridge(): Promise<void> {
  const { plugins } = await discoverPlugins();
  const registry = new Map<string, DiscoveredTool>();
  for (const t of flattenTools(plugins)) registry.set(t.fqName, t);

  const rl = readline.createInterface({ input: process.stdin });
  const send = (msg: unknown) => process.stdout.write(JSON.stringify(msg) + '\n');

  for await (const line of rl) {
    if (!line.trim()) continue;
    let req: JsonRpcRequest;
    try {
      req = JSON.parse(line) as JsonRpcRequest;
    } catch {
      continue;
    }
    const respond = (id: number | string | undefined, result: unknown) => {
      if (id === undefined || id === null) return; // notification
      send({ jsonrpc: '2.0', id, result });
    };
    const fail = (
      id: number | string | undefined,
      code: number,
      message: string,
    ) => {
      if (id === undefined || id === null) return;
      send({ jsonrpc: '2.0', id, error: { code, message } });
    };

    switch (req.method) {
      case 'initialize':
        respond(req.id, {
          protocolVersion: '2024-11-05',
          capabilities: { tools: {} },
          serverInfo: SERVER_INFO,
        });
        break;
      case 'notifications/initialized':
        break;
      case 'tools/list':
        respond(req.id, { tools: [...registry.values()].map(toolManifest) });
        break;
      case 'tools/call': {
        const name = String(req.params?.['name'] ?? '');
        const args = (req.params?.['arguments'] ?? {}) as Record<string, unknown>;
        const tool = registry.get(name);
        if (!tool) {
          fail(req.id, -32602, `Unknown tool: ${name}`);
          break;
        }
        if (!tool.handler) {
          fail(req.id, -32603, `Tool ${name} has no executable handler (regex-level discovery)`);
          break;
        }
        const inputData = typeof args['input_data'] === 'string' ? args['input_data'] : '';
        try {
          const output = await tool.handler(inputData);
          respond(req.id, {
            content: [{ type: 'text', text: output }],
            isError: false,
          });
        } catch (err) {
          respond(req.id, {
            content: [{ type: 'text', text: String(err) }],
            isError: true,
          });
        }
        break;
      }
      default:
        fail(req.id, -32601, `Method not found: ${req.method}`);
    }
  }
}

if (process.argv[1] && process.argv[1].endsWith('server.js')) {
  startMcpBridge().catch((e) => {
    console.error(String(e));
    process.exit(1);
  });
}
