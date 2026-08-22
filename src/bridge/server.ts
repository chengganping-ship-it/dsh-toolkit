import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod/v4';
import { discoverPlugins, flattenTools } from './loader.js';
import type { DiscoveredTool } from '../types.js';
import { CostGovernor } from '../cost/governor.js';

export const SERVER_INFO = { name: 'dsh-mcp-bridge', version: '2.0.0' };

export async function createBridgeServer(): Promise<McpServer> {
  const server = new McpServer(SERVER_INFO);
  const { plugins } = await discoverPlugins();
  const governor = new CostGovernor();

  for (const tool of flattenTools(plugins)) {
    registerBridgedTool(server, tool, governor);
  }
  return server;
}

function registerBridgedTool(
  server: McpServer,
  tool: DiscoveredTool,
  governor: CostGovernor,
): void {
  server.registerTool(
    tool.fqName,
    {
      title: `${tool.plugin} / ${tool.tool}`,
      description:
        tool.description ||
        `Tool ${tool.tool} provided by DSH plugin ${tool.plugin}`,
      inputSchema: {
        input_data: z
          .string()
          .describe('Unified string input contract (JSON or k=v pairs)'),
      },
    },
    async ({ input_data }: { input_data: string }) => {
      if (!tool.handler) {
        return {
          content: [{ type: 'text', text: `Tool ${tool.fqName} has no executable handler` }],
          isError: true,
        };
      }
      try {
        governor.charge({
          userKey: process.env['DSH_USER'] ?? 'stdio-client',
          pluginKey: tool.plugin,
          texts: [input_data],
        });
        const output = await tool.handler(input_data);
        return {
          content: [{ type: 'text', text: output }],
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: String(err) }],
          isError: true,
        };
      }
    },
  );
}

export async function startMcpBridge(): Promise<void> {
  const server = await createBridgeServer();
  await server.connect(new StdioServerTransport());
  console.error(`[dsh] ${SERVER_INFO.name} v${SERVER_INFO.version} serving on stdio`);
}

if (process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('server.js')) {
  startMcpBridge().catch((e) => {
    console.error(String(e));
    process.exit(1);
  });
}
