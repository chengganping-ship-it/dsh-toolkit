import * as fs from 'node:fs';
import * as path from 'node:path';

export interface RegexToolHit {
  name: string;
  description: string;
}

/**
 * Level-3 fallback discovery: regex-extract defineTool calls from raw source.
 */
export function extractToolsByRegex(pluginSrcDir: string): RegexToolHit[] {
  const hits: RegexToolHit[] = [];
  if (!fs.existsSync(pluginSrcDir)) return hits;
  for (const entry of fs.readdirSync(pluginSrcDir)) {
    if (!entry.endsWith('.ts') && !entry.endsWith('.js')) continue;
    const src = fs.readFileSync(path.join(pluginSrcDir, entry), 'utf8');
    const re =
      /defineTool\(\s*\{([\s\S]*?)\}\s*\)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src))) {
      const body = m[1];
      const name = body.match(/name:\s*['"`]([^'"`]+)['"`]/)?.[1];
      if (!name) continue;
      const description =
        body.match(/description:\s*['"`]([^'"`]+)['"`]/)?.[1] ?? '';
      hits.push({ name, description });
    }
  }
  return hits;
}
