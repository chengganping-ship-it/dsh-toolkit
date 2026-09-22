import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import { execSync } from 'node:child_process';
import { discoverPlugins, flattenTools } from '../bridge/loader.js';
import { defaultValidators } from '../loop/validators.js';
import { selfCritique } from '../loop/critic.js';
import { buildRelationGraph, type RelationEdge } from '../graph/relations.js';
import {
  loadState,
  newState,
  saveState,
  enterPhase,
  recordError,
  needsHumanEscalation,
  evaluatePlanGate,
  approvePlan,
  resumePhase,
  type PipelineState,
} from '../orchestration/state.js';

/**
 * RSI (recursive self-improvement) engine with JEO-inspired orchestration.
 *
 *   PLAN    -> propose candidates from the relation graph, gate the plan
 *   EXECUTE -> materialize + compile + run + score, keep the fittest
 *   VERIFY  -> end-to-end HTTP verification through the REST gateway
 *   CLEANUP -> delete rejected candidates, persist lineage, mark done
 *
 * The plan gate obeys JEO rules: never execute without an approved plan;
 * an unchanged plan hash with a terminal approval is not re-reviewed;
 * feedback_required forces a revision (new hash).
 */

export interface Candidate {
  id: string;
  name: string;
  description: string;
  members: string[];
  source: string;
}

export interface Evaluation {
  id: string;
  compiled: boolean;
  executed: boolean;
  score: number;
  validatorFailures: string[];
  notes: string[];
}

export interface Lineage {
  generation: number;
  startedAt: string;
  embedder: string;
  planHash: string;
  gate: string;
  candidates: number;
  kept: string[];
  rejected: string[];
  evaluations: Evaluation[];
  verify: VerifyEvidence[];
}

export interface VerifyEvidence {
  plugin: string;
  httpStatus: number;
  accepted: boolean;
  outputLength: number;
  ok: boolean;
}

/** Stage-failure markers: a pipeline whose downstream stage failed is not fit. */
const STAGE_FAILURE_MARKERS = [
  /执行失败/,
  /需要桥接/,
  /missing handler/i,
  /no executable handler/i,
  /\[missing /,
  /外部适配器执行失败/,
  /管道执行失败/,
];

/**
 * Coherence-aware fitness. Base quality comes from the L3 critique; on top of
 * that we penalize validator failures, downstream stage failures, no-op
 * pipelines (stage B echoing stage A) and redundancy (stage A text repeated).
 */
export function scorePipeline(output: string, stageA: string, stageB: string): {
  score: number;
  notes: string[];
} {
  const notes: string[] = [];
  const failed = defaultValidators().map((v) => v(output)).filter((r) => !r.passed);
  let score = selfCritique(output).overall;

  for (const m of STAGE_FAILURE_MARKERS) {
    if (m.test(output)) {
      score -= 0.35;
      notes.push(`stage failure marker: ${m}`);
      break;
    }
  }
  if (stageB.trim().length === 0) {
    score -= 0.3;
    notes.push('stage B produced empty output');
  }
  if (stageA.trim() === stageB.trim() && stageA.trim().length > 0) {
    score -= 0.25;
    notes.push('no-op pipeline (stage B echoed stage A)');
  }
  // an introspection probe is not a data transformation - composing it adds no value
  if (/导出成员/.test(stageA) || /导出成员/.test(stageB)) {
    score -= 0.3;
    notes.push('stage is an introspection probe (no data transformation)');
  }
  // redundancy: more than half of stage A reappears verbatim in stage B
  if (stageA.length > 200 && stageB.includes(stageA.slice(0, Math.floor(stageA.length * 0.6)))) {
    score -= 0.1;
    notes.push('redundant composition');
  }
  score -= failed.length * 0.1;
  if (failed.length) notes.push(`validator failures: ${failed.map((f) => f.validator).join(',')}`);

  return { score: Number(Math.max(0, score).toFixed(3)), notes };
}

const SAMPLE_BY_TOOL: Record<string, string> = {
  'dsh-tool-text-summary.summarize': 'top=2\n第一句用于摘要测试。第二句包含数字 42。',
  'dsh-tool-json-format.format': '{"rsi":true,"n":1}',
  'dsh-tool-unit-convert.convert': '{"value":10,"from":"km","to":"mile"}',
  'dsh-tool-codec-kit.codec': '{"action":"encode","encoding":"base64","text":"rsi"}',
  'dsh-tool-text-diff.diff': '{"a":"alpha beta","b":"alpha gamma"}',
  'dsh-tool-date-math.calc': '{"start":"2026-01-05","addDays":7}',
  'dsh-tool-csv-stats.stats': 'a,b\n1,2\n3,4',
  'dsh-tool-loan-calc.calc': '{"principal":100000,"annualRatePct":3,"years":5}',
};

/** Propose pipeline candidates by composing tools connected in the relation graph. */
export function proposeCandidates(
  edges: RelationEdge[],
  available: string[],
  limit = 3,
  avoid: Set<string> = new Set(),
): Candidate[] {
  const have = new Set(available);
  const out: Candidate[] = [];
  const seen = new Set<string>();

  for (const e of edges.sort((a, b) => b.score - a.score)) {
    if (!have.has(e.source) || !have.has(e.target)) continue;
    if (e.source === e.target) continue;
    // depth guard: never stack two generated pipelines (avoids RSI x RSI nesting)
    if (isGenerated(e.source) && isGenerated(e.target)) continue;
    const key = [e.source, e.target].sort().join('+');
    if (seen.has(key)) continue;
    // negative memory: do not re-propose combinations that already failed
    if (avoid.has(key)) continue;
    seen.add(key);

    // stable short identity instead of nested name explosion
    const slug = crypto.createHash('sha1').update(key).digest('hex').slice(0, 8);
    const name = `dsh-tool-rsi-${slug}`;
    out.push({
      id: key,
      name,
      description: `RSI pipeline [${slug}]: ${e.source} -> ${e.target} (${e.predicate})`,
      members: [e.source, e.target],
      source: renderPipelineSource(name, e.predicate, e.source, e.target),
    });
    if (out.length >= limit) break;
  }
  return out;
}

export function isGenerated(fq: string): boolean {
  return fq.startsWith('dsh-tool-rsi-');
}

/** Cross-run memory: previously rejected combinations are not retried. */
export function loadRsiMemory(workDir: string): {
  avoid: Set<string>;
  kept: Set<string>;
  generations: number;
} {
  const file = path.join(workDir, 'rsi', 'lineage.json');
  const avoid = new Set<string>();
  const kept = new Set<string>();
  let generations = 0;
  if (!fs.existsSync(file)) return { avoid, kept, generations };
  try {
    const history = JSON.parse(fs.readFileSync(file, 'utf8')) as Lineage[];
    generations = history.length;
    for (const h of history) {
      for (const id of h.rejected) avoid.add(id);
      for (const id of h.kept) {
        kept.add(id);
        avoid.delete(id); // a combination kept later is allowed again
      }
    }
  } catch {
    /* ignore corrupt memory */
  }
  return { avoid, kept, generations };
}

/** Human-readable plan document (the artifact reviewed by the plan gate). */
export function renderPlan(
  candidates: Candidate[],
  embedder: string,
  keep: number,
): string {
  return [
    '# RSI Plan',
    '',
    `- Embedder: ${embedder}`,
    `- Candidates: ${candidates.length} (keep top ${keep})`,
    '- Completion criteria: every kept plugin compiles, executes, passes all L3 validators, and answers HTTP 200 through the REST gateway',
    '',
    '## Candidates',
    ...candidates.map(
      (c, i) =>
        `${i + 1}. ${c.name}\n   - members: ${c.members.join(' + ')}\n   - ${c.description}`,
    ),
    '',
    '## Risks',
    '- composed pipelines may not be semantically meaningful (relation heuristic)',
    '- rejected candidates are deleted, so selection is destructive by design',
    '',
  ].join('\n');
}

function renderPipelineSource(
  name: string,
  predicate: string,
  a: string,
  b: string,
): string {
  const [aPlugin, aTool] = a.split('.');
  const [bPlugin, bTool] = b.split('.');
  return `// Generated by DSH RSI engine - self-sufficient pipeline (${predicate})
// ${a} -> ${b}
const STAGE_A = '${a}';
const STAGE_B = '${b}';
const STAGE_A_DIR = '${aPlugin}';
const STAGE_A_TOOL = '${aTool}';
const STAGE_B_DIR = '${bPlugin}';
const STAGE_B_TOOL = '${bTool}';

async function loadHandler(dir: string, tool: string) {
  const mod: any = await import(\`../../\${dir}/src/index.js\`);
  const plugin = mod.default ?? mod;
  const reg: Record<string, (i: string) => Promise<string>> = {};
  await plugin.apply({
    defineTool: (d: any) => { reg[d.name] = d.handler; },
    logger: { info() {}, warn() {} },
  });
  return reg[tool];
}

export default {
  async apply(ctx: PluginContext) {
    ctx.defineTool({
      name: 'pipeline',
      description:
        'RSI pipeline: runs ${a} then ${b}. Input JSON passed to stage A.',
      handler: async (inputData: string) => {
        try {
          const runA = await loadHandler(STAGE_A_DIR, STAGE_A_TOOL);
          const runB = await loadHandler(STAGE_B_DIR, STAGE_B_TOOL);
          const stageA = await runA(inputData);
          const stageB = await runB(stageA);
          return [
            '# RSI 组合管道结果',
            '',
            \`- 谓词：${predicate}\`,
            \`- 阶段 A（\${STAGE_A}）输出长度：\${stageA.length}\`,
            '',
            '## 阶段 A 输出',
            stageA,
            '',
            '## 阶段 B 输出',
            stageB,
            '',
            '> 免责声明：本输出由 RSI 自动组合的确定性管道生成，仅供参考。',
          ].join('\\n');
        } catch (e) {
          return [
            '# RSI 管道执行失败',
            '',
            String(e),
            '',
            \`- 阶段 A：\${STAGE_A}\`,
            \`- 阶段 B：\${STAGE_B}\`,
            '',
            '> 免责声明：本输出由 RSI 引擎生成，仅供参考。',
          ].join('\\n');
        }
      },
    });
  },
};
`;
}

export interface RsiOptions {
  generations?: number;
  keep?: number;
  workDir?: string;
  limitCandidates?: number;
  /** 'auto' (default, deterministic) or 'manual' (requires DSH_RSI_APPROVAL=1) */
  gate?: 'auto' | 'manual';
  /** fitness bar: candidates below this score are culled (default 0.8) */
  minScore?: number;
}

export interface RsiResult {
  lineage: Lineage[];
  state: PipelineState;
}

export async function runRsi(opts: RsiOptions = {}): Promise<RsiResult> {
  const generations = opts.generations ?? 1;
  const keep = opts.keep ?? 2;
  const workDir = opts.workDir ?? process.cwd();
  const limitCandidates = opts.limitCandidates ?? 3;
  const gateMode = opts.gate ?? 'auto';
  const minScore = opts.minScore ?? 0.8;

  const history: Lineage[] = [];
  let state = loadState(workDir) ?? newState('rsi: evolve plugin candidates from relation graph');
  const resumeFrom = resumePhase(state);
  if (resumeFrom !== 'plan' && resumeFrom !== 'done') {
    console.error(`[rsi] resuming from checkpoint: ${resumeFrom}`);
  }
  saveState(state, workDir);

  const memory = loadRsiMemory(workDir);
  const avoid = new Set(memory.avoid);
  if (memory.generations > 0) {
    console.error(
      `[rsi] memory: ${memory.generations} prior generation(s), ${avoid.size} avoided combination(s), ${memory.kept.size} survivor(s)`,
    );
  }

  for (let gen = 1; gen <= generations; gen++) {
    const startedAt = new Date().toISOString();

    // ---------------- PLAN ----------------
    enterPhase(state, 'plan');
    const graph = await buildRelationGraph();
    const { plugins } = await discoverPlugins();
    const available = flattenTools(plugins).map((t) => t.fqName);
    const candidates = proposeCandidates(graph.edges, available, limitCandidates, avoid);
    const planText = renderPlan(candidates, graph.embedder, keep);
    fs.mkdirSync(path.join(workDir, '.dsh', 'plans'), { recursive: true });
    fs.writeFileSync(path.join(workDir, '.dsh', 'plans', `rsi-gen${gen}.md`), planText);

    const decision = evaluatePlanGate(state, planText);
    if (decision.action === 'skip') {
      console.error(`[rsi] plan gate: SKIP (${decision.reason})`);
    } else if (decision.action === 'revise') {
      recordError(state, decision.reason);
      saveState(state, workDir);
      throw new Error(`[rsi] plan gate blocked: ${decision.reason}`);
    } else {
      const approved =
        gateMode === 'auto' || process.env['DSH_RSI_APPROVAL'] === '1';
      if (!approved) {
        state.plan_gate_status = 'infrastructure_blocked';
        saveState(state, workDir);
        console.error('[rsi] plan gate: awaiting manual approval');
        console.error(`       plan written to .dsh/plans/rsi-gen${gen}.md`);
        console.error('       re-run with DSH_RSI_APPROVAL=1 to approve');
        return { lineage: history, state };
      }
      approvePlan(state, gateMode === 'auto' ? 'auto' : 'manual');
      console.error(`[rsi] plan gate: APPROVED (${state.plan_gate_status})`);
    }
    if (!state.plan_approved) {
      recordError(state, 'refusing to execute without an approved plan');
      saveState(state, workDir);
      throw new Error('[rsi] refusing to enter EXECUTE without plan approval');
    }
    saveState(state, workDir);

    // ---------------- EXECUTE ----------------
    enterPhase(state, 'execute');
    saveState(state, workDir);
    const evaluations: Evaluation[] = [];
    const staged: Candidate[] = [];
    for (const c of candidates) {
      const dir = path.join(workDir, 'plugins', c.name, 'src');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(
        path.join(workDir, 'plugins', c.name, 'cordis.yml'),
        [
          `name: ${c.name}`,
          'version: 0.1.0',
          `description: ${c.description}`,
          'public: true',
          'tools:',
          `  - pipeline`,
          '',
        ].join('\n'),
      );
      fs.writeFileSync(path.join(dir, 'index.ts'), c.source);
      staged.push(c);
    }

    let compiled = false;
    try {
      execSync('npx tsc -p tsconfig.plugins.json', { cwd: workDir, stdio: 'pipe' });
      compiled = true;
    } catch (e) {
      compiled = false;
      recordError(state, `plugin compilation failed: ${String(e).slice(0, 200)}`);
    }

    for (const c of staged) {
      const ev: Evaluation = {
        id: c.id,
        compiled,
        executed: false,
        score: 0,
        validatorFailures: [],
        notes: [],
      };
      if (compiled) {
        const out = await tryExecute(c);
        if (out !== null) {
          ev.executed = true;
          const stages = splitStages(out);
          const scored = scorePipeline(out, stages.a, stages.b);
          ev.score = scored.score;
          ev.notes = [`output length ${out.length}`, ...scored.notes];
          ev.validatorFailures = defaultValidators()
            .map((v) => v(out))
            .filter((r) => !r.passed)
            .map((f) => f.validator);
        }
      }
      evaluations.push(ev);
    }

    evaluations.sort((a, b) => b.score - a.score);
    // evolution: survive only if above the fitness bar, then take the top K
    const qualified = evaluations.filter((e) => e.score >= minScore && e.executed);
    const kept = qualified.slice(0, keep).map((e) => e.id);
    const rejected = evaluations
      .filter((e) => !kept.includes(e.id))
      .map((e) => e.id);
    if (qualified.length < evaluations.length) {
      console.error(
        `[rsi] fitness bar ${minScore}: ${evaluations.length - qualified.length} candidate(s) below threshold`,
      );
    }
    // negative memory: remember what lost so later generations skip it
    for (const id of rejected) avoid.add(id);

    // ---------------- VERIFY (end-to-end through the REST gateway) ----------------
    enterPhase(state, 'verify');
    saveState(state, workDir);
    const verify: VerifyEvidence[] = [];
    if (compiled) {
      verify.push(...(await verifyThroughGateway(kept, staged)));
    }
    state.evidence[`gen${gen}`] = { kept, verify };
    const verifyOk = verify.length > 0 && verify.every((v) => v.ok);
    if (!verifyOk) {
      recordError(state, 'gateway verification did not pass for all kept plugins');
    }
    saveState(state, workDir);

    // ---------------- CLEANUP ----------------
    enterPhase(state, 'cleanup');
    for (const c of staged) {
      if (!kept.includes(c.id)) {
        fs.rmSync(path.join(workDir, 'plugins', c.name), { recursive: true, force: true });
      }
    }

    const lineage: Lineage = {
      generation: gen,
      startedAt,
      embedder: graph.embedder,
      planHash: state.plan_current_hash ?? '',
      gate: state.plan_gate_status,
      candidates: candidates.length,
      kept,
      rejected,
      evaluations,
      verify,
    };
    history.push(lineage);

    const dir = path.join(workDir, 'rsi');
    fs.mkdirSync(dir, { recursive: true });
    const lineageFile = path.join(dir, 'lineage.json');
    let persisted: Lineage[] = [];
    if (fs.existsSync(lineageFile)) {
      try {
        persisted = JSON.parse(fs.readFileSync(lineageFile, 'utf8')) as Lineage[];
      } catch {
        persisted = [];
      }
    }
    fs.writeFileSync(
      lineageFile,
      JSON.stringify([...persisted, ...history], null, 2) + '\n',
    );

    if (needsHumanEscalation(state)) {
      console.error(
        `[rsi] retry_count=${state.retry_count} (>=3) - human confirmation recommended`,
      );
    }
  }

  enterPhase(state, 'done');
  saveState(state, workDir);
  return { lineage: history, state };
}

async function verifyThroughGateway(
  kept: string[],
  staged: Candidate[],
): Promise<VerifyEvidence[]> {
  const out: VerifyEvidence[] = [];
  try {
    const { createGatewayApp } = await import('../gateway/server.js');
    const app = await createGatewayApp();
    const server = app.listen(0);
    const addr = server.address();
    const port = typeof addr === 'object' && addr ? addr.port : 0;

    for (const id of kept) {
      const c = staged.find((s) => s.id === id);
      if (!c) continue;
      const sample = SAMPLE_BY_TOOL[c.members[0]!] ?? c.members[0]!;
      const res = await fetch(`http://127.0.0.1:${port}/invoke`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': 'rsi-verify' },
        body: JSON.stringify({ tool: `${c.name}.pipeline`, input_data: sample }),
      });
      const body = (await res.json()) as { output?: string; accepted?: boolean };
      out.push({
        plugin: c.name,
        httpStatus: res.status,
        accepted: body.accepted === true,
        outputLength: (body.output ?? '').length,
        ok: res.status === 200 && (body.output ?? '').length > 0,
      });
    }
    server.close();
  } catch (e) {
    out.push({
      plugin: '(gateway)',
      httpStatus: 0,
      accepted: false,
      outputLength: 0,
      ok: false,
    });
    void e;
  }
  return out;
}

async function tryExecute(c: Candidate): Promise<string | null> {
  try {
    const { discoverPlugins: rediscover, flattenTools: flat } = await import(
      '../bridge/loader.js'
    );
    const { plugins } = await rediscover();
    const tools = flat(plugins);
    const self = tools.find((t) => t.plugin === c.name);
    if (!self?.handler) return null;
    const sample = SAMPLE_BY_TOOL[c.members[0]!] ?? c.members[0]!;
    return await self.handler(sample);
  } catch {
    return null;
  }
}

/** Split a generated pipeline's markdown into stage A / stage B sections. */
export function splitStages(output: string): { a: string; b: string } {
  const aMark = output.indexOf('## 阶段 A 输出');
  const bMark = output.indexOf('## 阶段 B 输出');
  if (aMark < 0 || bMark < 0) return { a: '', b: '' };
  const cut = (s: string): string => {
    const disclaimer = s.indexOf('> 免责声明');
    return (disclaimer >= 0 ? s.slice(0, disclaimer) : s).trim();
  };
  return {
    a: cut(output.slice(aMark + '## 阶段 A 输出'.length, bMark)),
    b: cut(output.slice(bMark + '## 阶段 B 输出'.length)),
  };
}
