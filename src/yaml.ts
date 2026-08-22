export interface YamlNode {
  [key: string]: string | string[];
}

/**
 * Minimal deterministic YAML subset parser for cordis.yml files.
 * Supports flat `key: value`, comments, quoted strings and `- item` lists.
 */
export function parseSimpleYaml(text: string): YamlNode {
  const node: YamlNode = {};
  let lastKey: string | null = null;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const listItem = line.match(/^-\s+(.*)$/);
    if (listItem && lastKey) {
      const existing = node[lastKey];
      const arr = Array.isArray(existing) ? existing : [];
      arr.push(unquote(listItem[1]));
      node[lastKey] = arr;
      continue;
    }
    const kv = line.match(/^([A-Za-z_][\w.-]*):\s*(.*)$/);
    if (!kv) continue;
    const key = kv[1];
    const value = kv[2].trim();
    if (value === '') {
      node[key] = [];
      lastKey = key;
      continue;
    }
    node[key] = unquote(value);
    lastKey = null;
  }
  return node;
}

function unquote(v: string): string {
  if (
    (v.startsWith('"') && v.endsWith('"') && v.length >= 2) ||
    (v.startsWith("'") && v.endsWith("'") && v.length >= 2)
  ) {
    return v.slice(1, -1);
  }
  return v;
}
