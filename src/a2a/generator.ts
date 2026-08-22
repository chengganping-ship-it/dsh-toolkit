import * as fs from 'node:fs';
import * as path from 'node:path';
import { discoverPlugins } from '../bridge/loader.js';

export interface A2AAgentInterface {
  url: string;
  protocolBinding: 'JSONRPC' | 'GRPC' | 'HTTP+JSON';
  protocolVersion: string;
  tenant?: string;
}

export interface A2ASkill {
  id: string;
  name: string;
  description: string;
  tags: string[];
  examples?: string[];
}

export interface A2AAgentCard {
  name: string;
  description: string;
  version: string;
  provider?: { organization: string; url: string };
  documentationUrl?: string;
  supportedInterfaces: A2AAgentInterface[];
  capabilities: {
    streaming: boolean;
    pushNotifications: boolean;
    stateTransitionHistory: boolean;
    extensions?: { uri: string }[];
  };
  securitySchemes?: Record<string, unknown>;
  securityRequirements?: Record<string, string[]>[];
  defaultInputModes: string[];
  defaultOutputModes: string[];
  skills: A2ASkill[];
}

/**
 * L2: generate Google A2A Protocol v1.0 AgentCard descriptors
 * (spec: https://a2a-protocol.org/v1.0.0/specification/).
 */
export async function generateA2ACards(outDir?: string): Promise<string[]> {
  const target = outDir ?? path.resolve(process.cwd(), 'a2a-cards');
  fs.mkdirSync(target, { recursive: true });
  const { plugins } = await discoverPlugins();
  const written: string[] = [];

  for (const p of plugins) {
    const card: A2AAgentCard = {
      name: p.meta?.name ?? p.dirName,
      description:
        p.meta?.description ||
        `DSH plugin ${p.dirName} exposing ${p.tools.length} tool(s)`,
      version: p.meta?.version ?? '0.0.0',
      provider: {
        organization: 'DSH Toolkit',
        url: 'https://github.com/dsh-toolkit',
      },
      documentationUrl: `https://github.com/dsh-toolkit/tree/main/plugins/${p.dirName}`,
      supportedInterfaces: [
        {
          url: `mcp://dsh-bridge/${p.dirName}`,
          protocolBinding: 'JSONRPC',
          protocolVersion: '1.0',
        },
      ],
      capabilities: {
        streaming: false,
        pushNotifications: false,
        stateTransitionHistory: false,
        extensions: [
          { uri: 'https://github.com/dsh-toolkit/extensions/unified-input-contract' },
        ],
      },
      securitySchemes: {},
      securityRequirements: [],
      defaultInputModes: ['text/plain'],
      defaultOutputModes: ['text/plain', 'text/markdown'],
      skills: p.tools.map((t) => ({
        id: t.fqName,
        name: t.tool,
        description:
          t.description || `Invoke ${t.tool} with unified input_data contract`,
        tags: [p.dirName, 'dsh'],
        examples: [`{"input_data": "<payload for ${t.tool}>"}`],
      })),
    };
    const file = path.join(target, `${p.dirName}.agent-card.json`);
    fs.writeFileSync(file, JSON.stringify(card, null, 2) + '\n');
    written.push(file);
  }
  return written;
}
