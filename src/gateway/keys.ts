import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';

export interface KeyRecord {
  key: string;
  name: string;
  quotaTokens: number | null;
  created: string;
  revoked: boolean;
}

export function keysFilePath(): string {
  return path.resolve(process.cwd(), 'dsh.keys.json');
}

export function loadKeys(): KeyRecord[] {
  const f = keysFilePath();
  if (!fs.existsSync(f)) return [];
  try {
    return JSON.parse(fs.readFileSync(f, 'utf8')) as KeyRecord[];
  } catch {
    return [];
  }
}

export function saveKeys(records: KeyRecord[]): void {
  fs.writeFileSync(keysFilePath(), JSON.stringify(records, null, 2) + '\n');
}

export function createKey(name: string, quotaTokens: number | null = null): KeyRecord {
  const rec: KeyRecord = {
    key: `dsh_${crypto.randomBytes(16).toString('hex')}`,
    name,
    quotaTokens,
    created: new Date().toISOString(),
    revoked: false,
  };
  const all = loadKeys();
  all.push(rec);
  saveKeys(all);
  return rec;
}

export function revokeKey(nameOrKey: string): boolean {
  const all = loadKeys();
  let hit = false;
  for (const r of all) {
    if (r.name === nameOrKey || r.key === nameOrKey) {
      r.revoked = true;
      hit = true;
    }
  }
  if (hit) saveKeys(all);
  return hit;
}

/** Returns the active record for a raw key, or null when invalid/revoked. */
export function verifyKey(key: string): KeyRecord | null {
  return loadKeys().find((r) => r.key === key && !r.revoked) ?? null;
}

// ---- usage ledger (JSONL) ----

export interface UsageEntry {
  ts: string;
  key: string;
  tool: string;
  tokens: number;
  status: number;
}

export function usageFilePath(): string {
  return path.resolve(process.cwd(), 'dsh.usage.jsonl');
}

export function appendUsage(entry: UsageEntry): void {
  fs.appendFileSync(usageFilePath(), JSON.stringify(entry) + '\n');
}

export interface UsageAggregate {
  byKey: Record<string, { calls: number; tokens: number; errors: number }>;
  byTool: Record<string, { calls: number; tokens: number }>;
  totalCalls: number;
}

export function readUsage(limitLines = 5000): UsageAggregate {
  const f = usageFilePath();
  const agg: UsageAggregate = { byKey: {}, byTool: {}, totalCalls: 0 };
  if (!fs.existsSync(f)) return agg;
  const lines = fs.readFileSync(f, 'utf8').trim().split('\n').slice(-limitLines);
  for (const line of lines) {
    try {
      const e = JSON.parse(line) as UsageEntry;
      agg.totalCalls++;
      const k = (agg.byKey[e.key] ??= { calls: 0, tokens: 0, errors: 0 });
      k.calls++;
      k.tokens += e.tokens;
      if (e.status >= 400) k.errors++;
      const t = (agg.byTool[e.tool] ??= { calls: 0, tokens: 0 });
      t.calls++;
      t.tokens += e.tokens;
    } catch {
      /* skip bad line */
    }
  }
  return agg;
}
