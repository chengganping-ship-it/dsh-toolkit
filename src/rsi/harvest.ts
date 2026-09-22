import * as fs from 'node:fs';
import * as path from 'node:path';
import { execSync } from 'node:child_process';
import { discoverPlugins, flattenTools } from '../bridge/loader.js';
import { defaultValidators } from '../loop/validators.js';
import { selfCritique } from '../loop/critic.js';
import {
  loadState,
  newState,
  saveState,
  enterPhase,
  recordError,
  evaluatePlanGate,
  approvePlan,
  hashText,
  type PipelineState,
} from '../orchestration/state.js';

/**
 * External resource harvesting for RSI.
 *
 * Instead of only recombining what we already have, this reaches OUT:
 *   1. search public registries (npm) for resources that fill capability gaps
 *   2. gate by license / freshness / relevance  (no GPL, no abandoned, no noise)
 *   3. integrate: install + generate a DSH adapter plugin from a recipe
 *   4. verify: compile, execute, and call it over the REST gateway
 *   5. keep winners, record provenance in the lineage
 */

const PERMISSIVE = [
  'mit',
  'apache-2.0',
  'bsd-2-clause',
  'bsd-3-clause',
  'isc',
  '0bsd',
  'unlicense',
  'cc0-1.0',
];

export interface ResourceCandidate {
  name: string;
  version: string;
  description: string;
  license: string;
  weeklyDownloads: number;
  lastPublish: string | null;
  homepage: string | null;
  repoUrl: string | null;
  relevance: number;
  accepted: boolean;
  rejectReason?: string;
}

export interface HarvestPlan {
  queries: string[];
  candidates: ResourceCandidate[];
  selected: string[];
  keep: number;
  planHash: string;
}

export interface Recipe {
  /** package name -> how to expose it as a DSH tool */
  tool: string;
  description: string;
  sample: string;
  body: string; // TS body; `mod` holds the required package
}

/** Curated recipes for well-known package shapes. */
export const RECIPES: Record<string, Recipe> = {
  marked: {
    tool: 'to_html',
    description: 'Convert Markdown text to HTML (marked, MIT).',
    sample: '# Hello\n\n- a\n- b\n\n**bold** text.',
    body: `const html = mod.marked ? mod.marked.parse(inputData) : mod.parse(inputData);
        return ['# Markdown → HTML', '', '\`\`\`html', html, '\`\`\`', '', '> 免责声明：转换结果请自行校验，仅供参考。'].join('\\n');`,
  },
  nanoid: {
    tool: 'ids',
    description: 'Generate random IDs of a given length (nanoid, MIT).',
    sample: '12',
    body: `const n = Math.max(4, Math.min(64, Number(inputData.trim()) || 10));
        const gen = mod.nanoid ?? mod.default ?? mod;
        const ids = Array.from({ length: 5 }, () => gen(n));
        return ['# 随机 ID 生成', '', \`- 长度：\${n}，数量：\${ids.length}\`, '', '\`\`\`', ...ids, '\`\`\`', '', '> 免责声明：仅供测试使用，仅供参考。'].join('\\n');`,
  },
  papaparse: {
    tool: 'to_json',
    description: 'Parse CSV text into JSON rows (papaparse, MIT).',
    sample: 'name,age\nAlice,30\nBob,25',
    body: `const Papa = mod.default ?? mod;
        const res = Papa.parse(inputData.trim(), { header: true, skipEmptyLines: true });
        const rows = res.data ?? [];
        return ['# CSV → JSON', '', \`- 行数：\${rows.length}\`, '', '\`\`\`json', JSON.stringify(rows.slice(0, 20), null, 2), '\`\`\`', '', '> 免责声明：解析结果请自行校验，仅供参考。'].join('\\n');`,
  },
  validator: {
    tool: 'check',
    description: 'Validate email / URL / mobile number strings (validator, MIT).',
    sample: 'user@example.com',
    body: `const v = mod.default ?? mod;
        const s = inputData.trim();
        const checks: [string, boolean][] = [
          ['email', v.isEmail ? v.isEmail(s) : false],
          ['url', v.isURL ? v.isURL(s, { require_protocol: false }) : false],
          ['手机号(zh-CN)', v.isMobilePhone ? v.isMobilePhone(s, 'zh-CN') : false],
          ['纯数字', /^\\d+$/.test(s)],
        ];
        return ['# 格式校验', '', \`- 输入：\\\`\${s}\\\`\`, '', '| 规则 | 结果 |', '|---|---|', ...checks.map(([k, ok]) => \`| \${k} | \${ok ? 'PASS' : 'FAIL'} |\`), '', '> 免责声明：基于第三方库的静态校验，仅供参考。'].join('\\n');`,
  },
  slugify: {
    tool: 'slug',
    description: 'Convert a title into a URL slug (slugify, MIT).',
    sample: 'Hello World 你好 世界',
    body: `const f = mod.default ?? mod;
        const out = typeof f === 'function' ? f(inputData.trim()) : String(inputData);
        return ['# URL Slug', '', \`- 原文：\${inputData.trim()}\`, \`- Slug：\\\`\${out}\\\`\`, '', '> 免责声明：仅供参考。'].join('\\n');`,
  },
  diff: {
    tool: 'compare',
    description: 'Line-level diff between two texts (jsdiff, BSD-3-Clause).',
    sample: '{"a":"line1\\nline2","b":"line1\\nlineX"}',
    body: `let a = '', b = '';
        try { const j = JSON.parse(inputData); a = String(j.a ?? ''); b = String(j.b ?? ''); }
        catch { a = inputData; b = ''; }
        const diff = mod.diffLines ?? mod.default?.diffLines;
        const parts = diff(a, b);
        const lines = parts.map((p: any) => \`\${p.added ? '+' : p.removed ? '-' : ' '} \${p.value.trimEnd()}\`);
        return ['# 文本差异', '', \`- 变更块：\${parts.length}\`, '', '\`\`\`diff', ...lines, '\`\`\`', '', '> 免责声明：仅供参考。'].join('\\n');`,
  },
};

export function recipeFor(pkg: string): Recipe | null {
  const key = pkg.toLowerCase();
  if (RECIPES[key]) return RECIPES[key];
  // scoped or suffixed names: try last path segment
  const tail = key.includes('/') ? key.split('/').pop()! : key;
  return RECIPES[tail] ?? null;
}

/**
 * Generic adapter for packages without a curated recipe: introspects the
 * package surface and invokes the default export when it is callable.
 * Honest by construction - it reports what the package actually exposes.
 */
export function renderProbeSource(pkg: string): string {
  return `// Generated by DSH RSI harvester - generic probe adapter for "${pkg}"
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

export default {
  async apply(ctx: PluginContext) {
    ctx.defineTool({
      name: 'probe',
      description: ${JSON.stringify(`Introspect external package ${pkg}: list exports and invoke the default export when callable.`)},
      handler: async (inputData: string) => {
        try {
          const mod: any = require(${JSON.stringify(pkg)});
          const keys = Object.keys(mod ?? {});
          const kinds = keys.slice(0, 40).map((k) => {
            const t = typeof mod[k];
            return \`| \\\`\${k}\\\` | \${t} |\`;
          });
          const lines = [
            '# 外部包能力探针',
            '',
            \`- 包：${pkg}\`,
            \`- 导出成员：\${keys.length}\`,
            '',
            '| 导出 | 类型 |',
            '|---|---|',
            ...kinds,
          ];
          const callable =
            typeof mod === 'function'
              ? mod
              : typeof mod.default === 'function'
                ? mod.default
                : null;
          if (callable) {
            try {
              const out = await callable(inputData);
              lines.push(
                '',
                '## 默认导出调用结果',
                '',
                '\`\`\`',
                typeof out === 'string' ? out.slice(0, 2000) : JSON.stringify(out, null, 2).slice(0, 2000),
                '\`\`\`',
              );
            } catch (e) {
              lines.push('', \`## 默认导出调用失败\`, '', String(e));
            }
          } else {
            lines.push(
              '',
              '## 说明',
              '该包没有可直接调用的默认导出，需为其编写专用配方（recipe）后才能作为独立工具使用。',
            );
          }
          lines.push('', '> 免责声明：探针结果来自运行时自省，仅供参考。');
          return lines.join('\\n');
        } catch (e) {
          return [
            '# 外部包探针失败',
            '',
            \`- 包：${pkg}\`,
            \`- 错误：\${String(e)}\`,
            '',
            '> 免责声明：本工具包装第三方库，仅供参考。',
          ].join('\\n');
        }
      },
    });
  },
};
`;
}

/** Capability-gap queries used when the caller does not supply any. */
export const DEFAULT_QUERIES = [
  'markdown to html',
  'unique id generator',
  'csv parser',
  'string validator',
];

function lexicalRelevance(query: string, text: string): number {
  const q = new Set(query.toLowerCase().split(/\W+/).filter((w) => w.length > 2));
  const t = text.toLowerCase();
  if (q.size === 0) return 0;
  let hit = 0;
  for (const w of q) if (t.includes(w)) hit++;
  return hit / q.size;
}

interface NpmSearchObject {
  package: {
    name: string;
    version: string;
    description?: string;
    date?: string;
    links?: { npm?: string; homepage?: string; repository?: string };
    publisher?: { username?: string };
  };
  score?: { final?: number };
  downloads?: { weekly?: number };
}

/** Discover external resources from the public npm registry. */
export async function searchNpm(query: string, size = 10): Promise<ResourceCandidate[]> {
  const url = `https://registry.npmjs.org/-/v1/search?text=${encodeURIComponent(query)}&size=${size}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`npm search failed: HTTP ${res.status}`);
  const data = (await res.json()) as { objects?: NpmSearchObject[] };
  const out: ResourceCandidate[] = [];
  for (const o of data.objects ?? []) {
    const p = o.package;
    const license = await fetchLicense(p.name);
    out.push({
      name: p.name,
      version: p.version,
      description: p.description ?? '',
      license,
      weeklyDownloads: o.downloads?.weekly ?? 0,
      lastPublish: p.date ?? null,
      homepage: p.links?.homepage ?? null,
      repoUrl: p.links?.repository ?? null,
      relevance: Number(
        lexicalRelevance(query, `${p.name} ${p.description ?? ''}`).toFixed(3),
      ),
      accepted: false,
    });
  }
  return out;
}

async function fetchLicense(name: string): Promise<string> {
  try {
    const res = await fetch(`https://registry.npmjs.org/${name}`, {
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) return 'unknown';
    const data = (await res.json()) as { license?: string; licenseText?: string };
    return (data.license ?? 'unknown').toLowerCase();
  } catch {
    return 'unknown';
  }
}

export function gateCandidate(
  c: ResourceCandidate,
  now = Date.now(),
  maxAgeYears = 2,
): ResourceCandidate {
  const lic = c.license.toLowerCase();
  const permissive = PERMISSIVE.includes(lic);
  const recent =
    !c.lastPublish ||
    now - new Date(c.lastPublish).getTime() < 1000 * 60 * 60 * 24 * 365 * maxAgeYears;
  const relevant = c.relevance >= 0.34;

  c.accepted = permissive && recent && relevant;
  if (!c.accepted) {
    c.rejectReason = !permissive
      ? `license not permissive (${c.license})`
      : !recent
        ? `not updated in ${maxAgeYears} years`
        : `relevance too low (${c.relevance})`;
  }
  return c;
}

export async function planHarvest(
  queries: string[],
  keep: number,
  maxAgeYears = 2,
): Promise<HarvestPlan> {
  const seen = new Set<string>();
  const candidates: ResourceCandidate[] = [];
  for (const q of queries) {
    let found: ResourceCandidate[] = [];
    try {
      found = await searchNpm(q, 10);
    } catch {
      continue;
    }
    for (const c of found) {
      if (seen.has(c.name)) continue;
      seen.add(c.name);
      candidates.push(gateCandidate(c, Date.now(), maxAgeYears));
    }
  }
  candidates.sort(
    (a, b) =>
      Number(b.accepted) - Number(a.accepted) ||
      b.relevance - a.relevance ||
      b.weeklyDownloads - a.weeklyDownloads,
  );
  const selected = candidates.filter((c) => c.accepted).slice(0, keep).map((c) => c.name);
  const planHash = hashText(
    JSON.stringify({ queries, selected, candidates: candidates.map((c) => [c.name, c.accepted, c.license]) }),
  );
  return { queries, candidates, selected, keep, planHash };
}

export function renderHarvestPlan(plan: HarvestPlan): string {
  return [
    '# RSI Harvest Plan (external resources)',
    '',
    `- Queries: ${plan.queries.join(' | ')}`,
    `- Discovered: ${plan.candidates.length}, accepted: ${plan.candidates.filter((c) => c.accepted).length}, will integrate: ${plan.selected.length}`,
    '- Completion criteria: adapter compiles, executes, passes L3 validators, and answers HTTP 200 through the REST gateway',
    '',
    '## Selected for integration',
    ...plan.selected.map((s) => {
      const c = plan.candidates.find((x) => x.name === s)!;
      return `- **${c.name}@${c.version}** (${c.license}, ↓${c.weeklyDownloads}/wk) — ${c.description}`;
    }),
    '',
    '## Rejected (with reason)',
    ...plan.candidates
      .filter((c) => !c.accepted)
      .slice(0, 20)
      .map((c) => `- ${c.name} (${c.license}) — ${c.rejectReason}`),
    '',
  ].join('\n');
}

/** Generate a self-contained DSH adapter plugin for an external npm package. */
export function renderAdapterSource(pkg: string, recipe: Recipe): string {
  return `// Generated by DSH RSI harvester - adapter for external package "${pkg}"
// Recipe: ${recipe.description}
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

export default {
  async apply(ctx: PluginContext) {
    ctx.defineTool({
      name: '${recipe.tool}',
      description: ${JSON.stringify(recipe.description + ` Input: ${recipe.sample.slice(0, 40)}`)},
      handler: async (inputData: string) => {
        try {
          const mod: any = require(${JSON.stringify(pkg)});
          ${recipe.body}
        } catch (e) {
          return [
            '# 外部适配器执行失败',
            '',
            \`- 包：${pkg}\`,
            \`- 错误：\${String(e)}\`,
            '',
            '> 免责声明：本工具包装第三方库，仅供参考。',
          ].join('\\n');
        }
      },
    });
  },
};
`;
}

export interface HarvestIntegration {
  package: string;
  version: string;
  license: string;
  pluginName: string;
  tool: string;
  mode: 'recipe' | 'probe';
  installed: boolean;
  compiled: boolean;
  executed: boolean;
  score: number;
  validatorFailures: string[];
  verify: { httpStatus: number; outputLength: number; ok: boolean };
  sourceUrl: string;
}

export interface HarvestLineage {
  generation: number;
  startedAt: string;
  queries: string[];
  planHash: string;
  gate: string;
  selected: string[];
  integrations: HarvestIntegration[];
  rejected: { name: string; reason: string }[];
}

export interface HarvestOptions {
  queries?: string[];
  keep?: number;
  workDir?: string;
  gate?: 'auto' | 'manual';
  maxAgeYears?: number;
}

export interface HarvestResult {
  lineage: HarvestLineage[];
  state: PipelineState;
}

export async function runHarvest(opts: HarvestOptions = {}): Promise<HarvestResult> {
  const queries = opts.queries?.length ? opts.queries : DEFAULT_QUERIES;
  const keep = opts.keep ?? 2;
  const workDir = opts.workDir ?? process.cwd();
  const gateMode = opts.gate ?? 'auto';
  const history: HarvestLineage[] = [];

  let state = loadState(workDir) ?? newState('rsi-harvest: integrate external resources');
  state.pipeline = 'rsi-harvest';
  saveState(state, workDir);

  // ---------------- PLAN ----------------
  enterPhase(state, 'plan');
  const plan = await planHarvest(queries, keep, opts.maxAgeYears ?? 2);
  fs.mkdirSync(path.join(workDir, '.dsh', 'plans'), { recursive: true });
  const planText = renderHarvestPlan(plan);
  fs.writeFileSync(path.join(workDir, '.dsh', 'plans', 'harvest.md'), planText);

  const decision = evaluatePlanGate(state, planText);
  if (decision.action === 'skip') {
    console.error(`[harvest] plan gate: SKIP (${decision.reason})`);
  } else if (decision.action === 'revise') {
    recordError(state, decision.reason);
    saveState(state, workDir);
    throw new Error(`[harvest] plan gate blocked: ${decision.reason}`);
  } else {
    const approved = gateMode === 'auto' || process.env['DSH_RSI_APPROVAL'] === '1';
    if (!approved) {
      state.plan_gate_status = 'infrastructure_blocked';
      saveState(state, workDir);
      console.error('[harvest] plan gate: awaiting manual approval (.dsh/plans/harvest.md)');
      console.error('          re-run with DSH_RSI_APPROVAL=1');
      return { lineage: history, state };
    }
    approvePlan(state, gateMode === 'auto' ? 'auto' : 'manual');
    console.error(`[harvest] plan gate: APPROVED (${state.plan_gate_status})`);
  }
  saveState(state, workDir);

  if (plan.selected.length === 0) {
    enterPhase(state, 'done');
    saveState(state, workDir);
    console.error('[harvest] no accepted external resources for the given queries');
    return { lineage: history, state };
  }

  // ---------------- EXECUTE ----------------
  enterPhase(state, 'execute');
  saveState(state, workDir);
  const integrations: HarvestIntegration[] = [];

  for (const pkgName of plan.selected) {
    const c = plan.candidates.find((x) => x.name === pkgName)!;
    const recipe = recipeFor(pkgName);
    const toolName = recipe ? recipe.tool : 'probe';
    const slug = pkgName.replace(/^@/, '').replace(/[\/.]/g, '-').toLowerCase();
    const pluginName = `dsh-tool-ext-${slug}`;

    let installed = false;
    try {
      execSync(`npm install ${pkgName} --save --no-fund --no-audit`, {
        cwd: workDir,
        stdio: 'pipe',
        timeout: 180000,
      });
      installed = true;
    } catch (e) {
      recordError(state, `npm install ${pkgName} failed: ${String(e).slice(0, 160)}`);
    }

    const srcDir = path.join(workDir, 'plugins', pluginName, 'src');
    fs.mkdirSync(srcDir, { recursive: true });
    fs.writeFileSync(
      path.join(workDir, 'plugins', pluginName, 'cordis.yml'),
      [
        `name: ${pluginName}`,
        `version: ${c.version}`,
        `description: Adapter for external package ${pkgName} (${c.license}) - ${c.description}`.slice(0, 200),
        'public: true',
        'tools:',
        `  - ${toolName}`,
        '',
      ].join('\n'),
    );
    fs.writeFileSync(
      path.join(srcDir, 'index.ts'),
      recipe ? renderAdapterSource(pkgName, recipe) : renderProbeSource(pkgName),
    );

    integrations.push({
      package: pkgName,
      version: c.version,
      license: c.license,
      pluginName,
      tool: toolName,
      mode: recipe ? 'recipe' : 'probe',
      installed,
      compiled: false,
      executed: false,
      score: 0,
      validatorFailures: [],
      verify: { httpStatus: 0, outputLength: 0, ok: false },
      sourceUrl: c.repoUrl ?? c.homepage ?? `https://www.npmjs.com/package/${pkgName}`,
    });
  }

  let compiled = false;
  try {
    execSync('npx tsc -p tsconfig.plugins.json', { cwd: workDir, stdio: 'pipe' });
    compiled = true;
  } catch (e) {
    recordError(state, `adapter compilation failed: ${String(e).slice(0, 200)}`);
  }

  if (compiled) {
    const { plugins } = await discoverPlugins();
    const tools = flattenTools(plugins);
    for (const integ of integrations) {
      integ.compiled = true;
      const t = tools.find((x) => x.plugin === integ.pluginName);
      if (!t?.handler) continue;
      const out = await t.handler(sampleFor(integ.package));
      integ.executed = true;
      const failed = defaultValidators().map((v) => v(out)).filter((r) => !r.passed);
      integ.validatorFailures = failed.map((f) => f.validator);
      integ.score = Number(
        Math.max(0, selfCritique(out).overall - failed.length * 0.1).toFixed(3),
      );
    }
  }
  saveState(state, workDir);

  // ---------------- VERIFY (over the REST gateway) ----------------
  enterPhase(state, 'verify');
  if (compiled) {
    try {
      const { createGatewayApp } = await import('../gateway/server.js');
      const app = await createGatewayApp();
      const server = app.listen(0);
      const addr = server.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      for (const integ of integrations) {
        const res = await fetch(`http://127.0.0.1:${port}/invoke`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-API-Key': 'harvest-verify' },
          body: JSON.stringify({
            tool: `${integ.pluginName}.${integ.tool}`,
            input_data: sampleFor(integ.package),
          }),
        });
        const body = (await res.json()) as { output?: string };
        integ.verify = {
          httpStatus: res.status,
          outputLength: (body.output ?? '').length,
          ok: res.status === 200 && (body.output ?? '').length > 0,
        };
      }
      server.close();
    } catch (e) {
      recordError(state, `gateway verification failed: ${String(e).slice(0, 160)}`);
    }
  }
  state.evidence['harvest'] = { integrations };
  saveState(state, workDir);

  // ---------------- CLEANUP ----------------
  enterPhase(state, 'cleanup');
  for (const integ of integrations) {
    const ok = integ.executed && integ.verify.ok && integ.validatorFailures.length === 0;
    if (!ok) {
      fs.rmSync(path.join(workDir, 'plugins', integ.pluginName), {
        recursive: true,
        force: true,
      });
      recordError(state, `discarded ${integ.pluginName} (verify failed)`);
    }
  }

  history.push({
    generation: 1,
    startedAt: new Date().toISOString(),
    queries,
    planHash: plan.planHash,
    gate: state.plan_gate_status,
    selected: plan.selected,
    integrations,
    rejected: plan.candidates
      .filter((c) => !c.accepted)
      .slice(0, 20)
      .map((c) => ({ name: c.name, reason: c.rejectReason ?? '' })),
  });

  const dir = path.join(workDir, 'rsi');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'harvest-lineage.json'),
    JSON.stringify(history, null, 2) + '\n',
  );

  enterPhase(state, 'done');
  saveState(state, workDir);
  return { lineage: history, state };
}

export function sampleFor(pkg: string): string {
  return recipeFor(pkg)?.sample ?? 'hello world';
}
