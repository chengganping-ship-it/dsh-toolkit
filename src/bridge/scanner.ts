import * as fs from 'node:fs';
import * as path from 'node:path';
import { parseSimpleYaml } from '../yaml.js';
import type { CordisMeta } from '../types.js';

export function pluginsRoot(): string {
  return path.resolve(process.cwd(), 'plugins');
}

export function listPluginDirs(root = pluginsRoot()): string[] {
  if (!fs.existsSync(root)) return [];
  return fs
    .readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name.startsWith('dsh-tool-'))
    .map((d) => d.name)
    .sort();
}

export function readCordis(pluginDir: string, root = pluginsRoot()): CordisMeta | null {
  const file = path.join(root, pluginDir, 'cordis.yml');
  if (!fs.existsSync(file)) return null;
  const node = parseSimpleYaml(fs.readFileSync(file, 'utf8'));
  const tools = node.tools;
  return {
    name: String(node.name ?? pluginDir),
    version: String(node.version ?? '0.0.0'),
    description: String(node.description ?? ''),
    public: node.public ? String(node.public) === 'true' : undefined,
    tools: Array.isArray(tools) ? tools.map(String) : undefined,
  };
}
