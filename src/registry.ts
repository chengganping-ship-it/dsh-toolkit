import * as fs from 'node:fs';
import * as path from 'node:path';
import { discoverPlugins } from './bridge/loader.js';

export interface RegistryTool {
  name: string;
  description: string;
  contract: { input_data: string };
}

export interface RegistryPlugin {
  plugin: string;
  version: string;
  description: string;
  tools: RegistryTool[];
}

export interface Registry {
  generatedAt: string;
  protocol: { mcp: string; a2a: string; rest: string };
  counts: { plugins: number; tools: number };
  plugins: RegistryPlugin[];
}

/**
 * Generates the marketplace catalog: registry.json + index.html.
 */
export async function generateRegistry(outDir?: string): Promise<string[]> {
  const target = outDir ?? path.resolve(process.cwd(), 'registry');
  fs.mkdirSync(target, { recursive: true });
  const discovered = await discoverPlugins();
  const plugins = discovered.plugins;

  const reg: Registry = {
    generatedAt: new Date().toISOString(),
    protocol: {
      mcp: 'stdio via official @modelcontextprotocol/sdk',
      a2a: 'v1.0 JSON-RPC via official @a2a-js/sdk',
      rest: 'POST /invoke {tool, input_data}',
    },
    counts: { plugins: plugins.length, tools: plugins.reduce((s, p) => s + p.tools.length, 0) },
    plugins: plugins.map((p) => ({
      plugin: p.dirName,
      version: p.meta?.version ?? '0.0.0',
      description: p.meta?.description ?? '',
      tools: p.tools.map((t) => ({
        name: t.fqName,
        description: t.description || `Invoke ${t.tool}`,
        contract: { input_data: 'string' },
      })),
    })),
  };

  const jsonFile = path.join(target, 'registry.json');
  fs.writeFileSync(jsonFile, JSON.stringify(reg, null, 2) + '\n');

  const rows = reg.plugins
    .map(
      (p) => `    <tr><td><b>${p.plugin}</b><br/><small>v${p.version}</small></td>
    <td>${p.description}</td>
    <td>${p.tools.map((t) => `<code>${t.name}</code>`).join('<br/>')}</td></tr>`,
    )
    .join('\n');

  const html = `<!doctype html>
<html lang="zh">
<head>
<meta charset="utf-8"/>
<title>DSH Plugin Registry</title>
<style>
body{font-family:system-ui,sans-serif;max-width:1100px;margin:2rem auto;padding:0 1rem;color:#222}
table{border-collapse:collapse;width:100%}
td,th{border:1px solid #ddd;padding:.6rem .8rem;text-align:left;vertical-align:top}
th{background:#f5f7fa}
code{background:#f0f3f7;padding:.1rem .35rem;border-radius:4px;font-size:.85em}
h1 small{color:#666;font-weight:normal}
</style>
</head>
<body>
<h1>DSH Plugin Registry <small>${reg.counts.plugins} plugins / ${reg.counts.tools} tools</small></h1>
<p>Protocols: MCP (stdio) · A2A v1.0 (JSON-RPC) · REST (<code>POST /invoke</code>)<br/>
Generated at ${reg.generatedAt}</p>
<table>
<tr><th>Plugin</th><th>Description</th><th>Tools</th></tr>
${rows}
</table>
<p><small>免责声明：所有工具输出由确定性算法生成，仅供参考。</small></p>
</body>
</html>
`;
  const htmlFile = path.join(target, 'index.html');
  fs.writeFileSync(htmlFile, html);
  return [jsonFile, htmlFile];
}
