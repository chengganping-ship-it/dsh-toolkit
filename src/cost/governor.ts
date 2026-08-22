import * as fs from 'node:fs';
import * as path from 'node:path';
import { estimateTokens } from './tracker.js';

export type BudgetScope = 'monthly' | 'user' | 'plugin';
export type BudgetState = 'OK' | 'WARNING' | 'CRITICAL' | 'EXCEEDED';

export interface BudgetConfig {
  monthly?: number;
  user?: number;
  plugin?: number;
}

export class CostExceededError extends Error {
  readonly scope: BudgetScope;
  readonly key: string;
  constructor(scope: BudgetScope, key: string) {
    super(`Budget EXCEEDED for ${scope}:${key} — call blocked`);
    this.name = 'CostExceededError';
    this.scope = scope;
    this.key = key;
  }
}

const THRESHOLDS: { state: BudgetState; min: number }[] = [
  { state: 'EXCEEDED', min: 1.0 },
  { state: 'CRITICAL', min: 0.9 },
  { state: 'WARNING', min: 0.7 },
];

/**
 * L4: monthly/user/plugin three-layer budgets with
 * OK -> WARNING -> CRITICAL -> EXCEEDED state machine.
 * Usage exceeding a budget is recorded (so state stays visible)
 * and the call is blocked by throwing CostExceededError.
 */
export class CostGovernor {
  private used = new Map<string, number>();
  private config: BudgetConfig;

  constructor(config?: BudgetConfig, configFile = 'dsh.budget.json') {
    this.config = config ?? this.loadFromFile(configFile);
  }

  private loadFromFile(file: string): BudgetConfig {
    const p = path.resolve(process.cwd(), file);
    if (!fs.existsSync(p)) return {};
    try {
      return JSON.parse(fs.readFileSync(p, 'utf8')) as BudgetConfig;
    } catch {
      return {};
    }
  }

  private bucket(scope: BudgetScope, key: string): string {
    return `${scope}:${key}`;
  }

  private classify(used: number, limit: number | null): BudgetState {
    if (limit === null || !Number.isFinite(limit)) return 'OK';
    const ratio = limit === 0 ? Infinity : used / limit;
    return THRESHOLDS.find((t) => ratio >= t.min)?.state ?? 'OK';
  }

  status(scope: BudgetScope, key: string): {
    state: BudgetState;
    used: number;
    limit: number | null;
  } {
    const limit = this.config[scope] ?? null;
    const used = this.used.get(this.bucket(scope, key)) ?? 0;
    return { state: this.classify(used, limit), used, limit };
  }

  /**
   * Record token usage for a call under all three scopes.
   * Throws CostExceededError when the charge pushes any budget past its limit.
   */
  charge(input: { userKey: string; pluginKey: string; texts: string[] }): void {
    const tokens = input.texts.reduce((s, t) => s + estimateTokens(t), 0);
    const targets: [BudgetScope, string][] = [
      ['monthly', 'global'],
      ['user', input.userKey],
      ['plugin', input.pluginKey],
    ];
    let blocked: CostExceededError | null = null;
    for (const [scope, key] of targets) {
      const b = this.bucket(scope, key);
      const limit = this.config[scope] ?? null;
      const next = (this.used.get(b) ?? 0) + tokens;
      this.used.set(b, next);
      if (limit !== null && Number.isFinite(limit) && next > limit && !blocked) {
        blocked = new CostExceededError(scope, key);
      }
    }
    if (blocked) throw blocked;
  }

  /** True when any budget for the given identity would be exceeded by more spend. */
  isBlocked(userKey: string, pluginKey: string, estimatedTokens = 0): boolean {
    return (
      [['monthly', 'global'], ['user', userKey], ['plugin', pluginKey] as const].some(
        ([scope, key]) => {
          const s = this.status(scope as BudgetScope, key);
          return (
            s.limit !== null &&
            Number.isFinite(s.limit) &&
            s.used + estimatedTokens > s.limit
          );
        },
      )
    );
  }

  snapshot(): Record<string, { state: BudgetState; used: number; limit: number | null }> {
    const out: Record<string, { state: BudgetState; used: number; limit: number | null }> = {};
    for (const bucket of this.used.keys()) {
      const idx = bucket.indexOf(':');
      if (idx < 0) continue;
      const scope = bucket.slice(0, idx) as BudgetScope;
      const key = bucket.slice(idx + 1);
      out[bucket] = this.status(scope, key);
    }
    return out;
  }
}
