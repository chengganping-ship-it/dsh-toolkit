import { CostGovernor } from '../cost/governor.js';
import { runWithLoop } from '../loop/runner.js';
import type { Executor, LoopOptions } from '../loop/runner.js';
export interface AgentTask {
  id: string;
  /** MCP-style fully qualified tool name, e.g. dsh-tool-x.y */
  toolFq?: string;
  /** Direct executor when no external tool is needed */
  run?: (inputData: string) => Promise<string>;
  input: (upstream: Map<string, string>) => string;
}

export type Phase = AgentTask[];

export interface PhaseResult {
  phase: number;
  results: { id: string; output: string; attempts: number; accepted: boolean }[];
}

export interface OrchestrationReport {
  phases: PhaseResult[];
  finalOutput: string;
  cost: Record<string, unknown>;
}

/** Deterministic seeded PRNG (mulberry32). Same seed -> same sequence. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * L5: sequential phases, parallel agents inside each phase,
 * wrapped by L3 loop engineering and L4 cost governance.
 */
export class Orchestrator {
  private registry = new Map<string, (i: string) => Promise<string>>();

  constructor(
    private governor: CostGovernor,
    private opts: { seed?: number; userKey?: string; loop?: LoopOptions } = {},
  ) {}

  registerTools(tools: Record<string, (i: string) => Promise<string>>): void {
    for (const [k, v] of Object.entries(tools)) this.registry.set(k, v);
  }

  async execute(
    phases: Phase[],
    integrate: (results: PhaseResult[]) => string,
  ): Promise<OrchestrationReport> {
    const rand = seededRandom(this.opts.seed ?? 42);
    const allResults: PhaseResult[] = [];
    const upstream = new Map<string, string>();

    for (let p = 0; p < phases.length; p++) {
      const phaseResult: PhaseResult = { phase: p + 1, results: [] };
      await Promise.all(
        phases[p].map(async (task) => {
          const inputData = task.input(upstream);
          const exec: Executor = async (attempt: number) => {
            if (task.run) return task.run(inputData);
            const handler = this.registry.get(task.toolFq ?? '');
            if (!handler) return `[missing handler] ${task.toolFq}`;
            // Linear fallback: later attempts append a stricter directive
            const suffix =
              attempt === 0
                ? ''
                : `\n[fallback-${attempt}] 请输出结构化、含具体数字与步骤的完整结果。(${rand().toFixed(4)})`;
            return handler(inputData + suffix);
          };

          try {
            this.governor.charge({
              userKey: this.opts.userKey ?? 'anonymous',
              pluginKey: task.toolFq?.split('.')[0] ?? 'inline',
              texts: [inputData],
            });
          } catch (e) {
            if ((e as Error).name === 'CostExceededError') throw e;
          }

          const r = await runWithLoop(exec, this.opts.loop);
          upstream.set(task.id, r.output);
          phaseResult.results.push({
            id: task.id,
            output: r.output,
            attempts: r.attempts,
            accepted: r.accepted,
          });
        }),
      );
      allResults.push(phaseResult);
    }

    return {
      phases: allResults,
      finalOutput: integrate(allResults),
      cost: this.governor.snapshot(),
    };
  }
}
