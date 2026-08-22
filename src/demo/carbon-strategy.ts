import { Orchestrator } from '../agents/orchestrator.js';
import { CostGovernor } from '../cost/governor.js';
import { discoverPlugins, flattenTools } from '../bridge/loader.js';
import { ollamaAvailable, ollamaChat } from '../llm/ollama.js';

/**
 * L5 demo: 5-agent cross-domain collaboration producing a
 * carbon-neutral strategy report in 4 sequential phases.
 *
 * Phase 1 (parallel x3): carbon baselines (energy / transport) + policy scan
 * Phase 2 (parallel x2): reduction plans (operations / energy mix)
 * Phase 3 (single):      carbon trading strategy
 * Phase 4 (single):      financial roadmap + final integration
 *
 * useLlm=true routes phases 3-4 synthesis through local Ollama (free inference),
 * wrapped by L3 loop engineering; falls back to deterministic tools otherwise.
 */
export async function runCarbonDemo(
  budget?: { monthly?: number; user?: number; plugin?: number },
  opts: { useLlm?: boolean } = {},
): Promise<string> {
  const governor = new CostGovernor(budget);
  const orch = new Orchestrator(governor, {
    seed: 42,
    userKey: 'demo-user',
    loop: { maxRetries: 2, threshold: 0.55 },
  });

  const { plugins } = await discoverPlugins();
  const handlers: Record<string, (i: string) => Promise<string>> = {};
  for (const t of flattenTools(plugins)) {
    if (t.handler) handlers[t.fqName] = t.handler;
  }
  orch.registerTools(handlers);

  let useLlm = opts.useLlm === true;
  if (useLlm && !(await ollamaAvailable())) {
    console.error('[demo] Ollama unavailable - falling back to deterministic synthesis');
    useLlm = false;
  }
  const llmRun =
    () =>
    async (inputData: string): Promise<string> => {
      if (!useLlm) return inputData;
      return ollamaChat(inputData, {
        system:
          '你是 DSH 多Agent系统的综合分析Agent。基于给定数据输出结构化 Markdown：含标题、具体数字、分点建议，结尾必须有一行以"> 免责声明："开头的免责声明。',
      });
    };

  const BASELINE = 'dsh-tool-carbon-baseline.baseline';
  const SUMMARY = 'dsh-tool-text-summary.summarize';
  const REPORT = 'dsh-tool-markdown-report.report';

  const phases = [
    // ---- Phase 1: parallel x3, carbon baselines ----
    [
      {
        id: 'baseline-energy',
        toolFq: BASELINE,
        input: () =>
          JSON.stringify({ electricity_kwh: 4200000, natural_gas_m3: 310000 }),
      },
      {
        id: 'baseline-transport',
        toolFq: BASELINE,
        input: () =>
          JSON.stringify({ gasoline_l: 86000, diesel_l: 145000, flight_km: 320000 }),
      },
      {
        id: 'policy-scan',
        toolFq: SUMMARY,
        input: () =>
          'top=3\n双碳政策要求重点排放单位在2030年前完成碳达峰，' +
          '全国碳市场覆盖行业扩展至钢铁、水泥、电解铝，年度配额收紧约5%。' +
          '绿色电力交易规模2026年预计增长40%，CCER重启后林业碳汇项目收益提升。' +
          '企业需在年报中披露范围一、范围二排放数据。',
      },
    ],
    // ---- Phase 2: parallel x2, reduction plans ----
    [
      {
        id: 'reduction-ops',
        toolFq: REPORT,
        input: (up: Map<string, string>) => {
          const e = up.get('baseline-energy') ?? '';
          return JSON.stringify({
            title: '运营减排计划',
            sections: [
              { heading: '基线依据', body: e.split('\n').slice(0, 12).join('\n') },
              {
                heading: '措施',
                body: [
                  '1. 空压机余热回收，预计年减电耗 320,000 kWh（约 -7.6%）。',
                  '2. LED 全厂改造，年减电耗 180,000 kWh。',
                  '3. 天然气锅炉改热泵，天然气消耗下降 35%。',
                ].join('\n'),
              },
              {
                heading: '目标',
                body: '范围一+二排放 24 个月内降低 18%，合计约减少 1,200 tCO2e/年。',
              },
            ],
          });
        },
      },
      {
        id: 'reduction-fleet',
        toolFq: REPORT,
        input: (up: Map<string, string>) =>
          JSON.stringify({
            title: '交通与物流减排计划',
            sections: [
              { heading: '基线依据', body: (up.get('baseline-transport') ?? '').split('\n').slice(0, 10).join('\n') },
              {
                heading: '措施',
                body: [
                  '1. 城市配送车辆 60% 电动化，柴油消耗下降 42%。',
                  '2. 出差差旅政策：500km 以内高铁替代航班，航空里程下降 30%。',
                ].join('\n'),
              },
            ],
          }),
        },
    ],
    // ---- Phase 3: single agent, carbon trading ----
    [
      {
        id: 'carbon-trading',
        toolFq: SUMMARY,
        run: useLlm ? llmRun() : undefined,
        input: (up: Map<string, string>) =>
          `top=4\n基于减排计划后的剩余配额缺口分析：当前基线合计约 ${extractTotal(up.get('baseline-energy') ?? '') + extractTotal(up.get('baseline-transport') ?? '')} 吨，` +
          '减排后预计仍有 800 tCO2e 缺口。全国碳市场 CEA 价格按 95 元/吨、CCER 按 68 元/吨测算，' +
          '优先采购林业 CCER 500 吨可节省成本 13,500 元；剩余 300 吨通过 CEA 履约，成本约 28,500 元。' +
          '建议建立月度碳资产台账并在价格低于 85 元/吨时分批建仓。',
      },
    ],
    // ---- Phase 4: single agent, financial roadmap ----
    [
      {
        id: 'financial-roadmap',
        toolFq: REPORT,
        run: useLlm
          ? llmRun()
          : undefined,
        input: (up: Map<string, string>) =>
          JSON.stringify({
            title: '碳中和财务路线图（2026-2030）',
            sections: [
              { heading: '投入', body: '节能改造总投入约 980 万元：余热回收 260 万、LED 90 万、热泵 380 万、车队电动化 250 万。' },
              {
                heading: '收益',
                body: '年节约能源费用 212 万元，碳交易优化收益年均约 4 万元，静态回收期约 4.5 年。',
              },
              { heading: '交易策略', body: (up.get('carbon-trading') ?? '').split('\n').slice(0, 8).join('\n') },
              { heading: '政策要点', body: up.get('policy-scan') ?? '' },
            ],
          }),
      },
    ],
  ];

  const report = await orch.execute(phases, (results) => {
    const parts = ['# DSH 多Agent 碳中和战略报告', ''];
    for (const phase of results) {
      for (const r of phase.results) {
        parts.push(`<!-- phase ${phase.phase} | agent ${r.id} | attempts=${r.attempts} accepted=${r.accepted} -->`);
        parts.push(r.output);
        parts.push('');
      }
    }
    return parts.join('\n');
  });

  const costLines = Object.entries(report.cost)
    .map(([k, v]) => `- ${k}: ${JSON.stringify(v)}`)
    .join('\n');

  return `${report.finalOutput}\n\n## 成本治理快照\n\n${costLines}\n`;
}

function extractTotal(baselineMd: string): number {
  const m = baselineMd.match(/合计：约 ([\d,.]+) tCO2e/);
  return m ? Number(m[1].replace(/,/g, '')) : 0;
}
