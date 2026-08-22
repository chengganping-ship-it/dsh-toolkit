import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { PluginModule, DiscoveredTool, CordisMeta } from '../types.js';
import { listPluginDirs, readCordis, pluginsRoot } from './scanner.js';
import { extractToolsByRegex } from './extractor.js';

export function compiledPluginsRoot(): string {
  if (process.env['DSH_COMPILED_PLUGINS']) {
    return path.resolve(process.env['DSH_COMPILED_PLUGINS']);
  }
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, '../plugins');
}

interface LoadedPlugin {
  dirName: string;
  meta: CordisMeta | null;
  tools: Map<string, (input: string) => Promise<string>>;
}

/**
 * Dynamic import of a compiled plugin with a mock context that
 * intercepts defineTool registrations.
 */
async function loadPlugin(distDir: string): Promise<LoadedPlugin['tools']> {
  const entry = path.join(distDir, 'index.js');
  if (!fs.existsSync(entry)) return new Map();
  const mod = (await import(pathToFileURL(entry).href)) as PluginModule & {
    default?: PluginModule;
  };
  const plugin: PluginModule | undefined =
    typeof mod.apply === 'function' ? mod : mod.default;
  if (!plugin || typeof plugin.apply !== 'function') return new Map();
  const tools = new Map<string, (input: string) => Promise<string>>();
  const ctx = {
    defineTool(def: { name: string; handler: (i: string) => Promise<string> }) {
      tools.set(def.name, def.handler);
    },
    logger: {
      info: () => {},
      warn: () => {},
    },
  };
  await plugin.apply(ctx);
  return tools;
}

/**
 * Three-level intelligent discovery:
 *   full cordis.yml -> tool count only -> source regex extraction.
 */
export async function discoverPlugins(): Promise<{
  plugins: { dirName: string; meta: CordisMeta | null; sourceLevel: string; tools: DiscoveredTool[] }[];
}> {
  const dirs = listPluginDirs();
  const result: {
    dirName: string;
    meta: CordisMeta | null;
    sourceLevel: string;
    tools: DiscoveredTool[];
  }[] = [];

  for (const dir of dirs) {
    const meta = readCordis(dir);
    let handlers = new Map<string, (i: string) => Promise<string>>();
    try {
      handlers = await loadPlugin(path.join(compiledPluginsRoot(), dir, 'src'));
    } catch {
      /* loader failure falls through to regex level */
    }
    const srcDir = path.join(pluginsRoot(), dir, 'src');

    if (meta?.tools && meta.tools.length > 0) {
      // Level 1: full cordis metadata + live handlers
      const tools: DiscoveredTool[] = meta.tools.map((t) => ({
        plugin: dir,
        tool: t,
        fqName: `${dir}.${t}`,
        description: '',
        handler: handlers.get(t) ?? null,
      }));
      result.push({ dirName: dir, meta, sourceLevel: 'full', tools });
    } else if (handlers.size > 0) {
      // Level 2: cordis present but no tool list -> count-only from runtime
      const tools: DiscoveredTool[] = [...handlers.keys()].map((t) => ({
        plugin: dir,
        tool: t,
        fqName: `${dir}.${t}`,
        description: '',
        handler: handlers.get(t)!,
      }));
      result.push({ dirName: dir, meta, sourceLevel: 'count-only', tools });
    } else {
      // Level 3: regex extraction from source, no executable handler
      const hits = extractToolsByRegex(srcDir);
      const tools: DiscoveredTool[] = hits.map((h) => ({
        plugin: dir,
        tool: h.name,
        fqName: `${dir}.${h.name}`,
        description: h.description,
        handler: null,
      }));
      result.push({ dirName: dir, meta, sourceLevel: 'regex', tools });
    }
  }
  return { plugins: result };
}

export function flattenTools(
  discovered: Awaited<ReturnType<typeof discoverPlugins>>['plugins'],
): DiscoveredTool[] {
  return discovered.flatMap((p) => p.tools);
}
