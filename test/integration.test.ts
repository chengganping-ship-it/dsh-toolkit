import { strict as assert } from 'node:assert';
import { test, describe, before } from 'node:test';
import * as path from 'node:path';

process.env['DSH_COMPILED_PLUGINS'] = path.resolve('dist/plugins');

const { discoverPlugins, flattenTools } = await import('../src/bridge/loader.js');
const { defaultValidators } = await import('../src/loop/validators.js');

const SAMPLES: Record<string, string> = {
  'dsh-tool-carbon-baseline.baseline': '{"electricity_kwh":100000,"natural_gas_m3":5000}',
  'dsh-tool-csv-stats.stats': 'name,age\nAlice,30\nBob,25\nCathy,41',
  'dsh-tool-invoice-calc.calc':
    '{"items":[{"name":"A","qty":2,"price":100},{"name":"B","qty":1,"price":50,"discount":0.2}],"taxRate":0.13}',
  'dsh-tool-json-format.format': '{"ok":true,"n":[1,2,3]}',
  'dsh-tool-loan-calc.calc': '{"principal":500000,"annualRatePct":3.1,"years":30}',
  'dsh-tool-markdown-report.report':
    '{"title":"测试报告","sections":[{"heading":"一","body":"内容"}]}',
  'dsh-tool-seo-audit.audit':
    '{"title":"DSH 工具包 - 插件化自动化平台","description":"这是一个足够长的描述文本用于通过 SEO 审计的描述长度检查项目。","keywords":["DSH","工具包"],"content":"' +
    'x'.repeat(320) +
    '"}',
  'dsh-tool-text-diff.diff': '{"a":"hello world foo","b":"hello world bar"}',
  'dsh-tool-text-summary.summarize':
    'top=3\n碳市场覆盖行业扩展至钢铁水泥电解铝，配额收紧约5%。绿色电力交易增长40%。企业需披露排放数据。',
  'dsh-tool-unit-convert.convert': '{"value":1,"from":"km","to":"mile"}',
  'dsh-tool-health-metrics.metrics':
    '{"weightKg":70,"heightCm":175,"age":30,"sex":"male","activity":1.55}',
  'dsh-tool-fx-rates.convert': '{"amount":1000,"from":"USD","to":"CNY"}',
  'dsh-tool-regex-lab.test': '{"pattern":"\\\\d+","flags":"g","text":"abc 123 def 456"}',
  'dsh-tool-codec-kit.codec': '{"action":"encode","encoding":"base64","text":"hello dsh"}',
  'dsh-tool-pass-forge.generate': '{"length":16,"count":5,"seed":42}',
  'dsh-tool-color-kit.analyze': '{"color":"#1A73E8","against":"#FFFFFF"}',
  'dsh-tool-invest-growth.project':
    '{"principal":100000,"monthlyAdd":2000,"annualRatePct":6,"years":10}',
  'dsh-tool-date-math.calc': '{"start":"2026-01-05","addWorkdays":10}',
  'dsh-tool-salary-tax.calc': '{"monthlySalary":25000,"housingPct":12}',
  'dsh-tool-readability.analyze':
    '这是一段用于可读性分析的中文示例文本，包含多个句子。每个句子长度适中，便于统计平均句长。' +
    '文本还包含一些数字比如 42 和百分比 15%。此外还有英文单词 readability 混排。'.repeat(3),
};

describe('integration: every tool executes end-to-end', () => {
  let tools: Map<
    string,
    { handler: ((i: string) => Promise<string>) | null; plugin: string }
  >;

  before(async () => {
    const { plugins } = await discoverPlugins();
    const flat = flattenTools(plugins);
    tools = new Map(flat.map((t) => [t.fqName, { handler: t.handler, plugin: t.plugin }]));
  });

  test('at least 20 tools discovered with handlers', () => {
    assert.ok(tools.size >= 20, `expected >=20 tools, got ${tools.size}`);
    for (const [name, t] of tools) {
      assert.ok(t.handler, `${name} has no compiled handler`);
    }
  });

  for (const [fqName, sample] of Object.entries(SAMPLES)) {
    test(`tool ${fqName} returns valid advisory output`, async () => {
      const t = tools.get(fqName);
      assert.ok(t?.handler, `${fqName} missing`);
      const out = await t.handler!(sample);
      assert.ok(out.length > 50, `${fqName} output too short: ${out.length}`);
      assert.ok(out.includes('免责声明'), `${fqName} missing disclaimer`);
      const failed = defaultValidators().map((v) => v(out)).filter((r) => !r.passed);
      assert.deepEqual(
        failed.map((f) => f.validator),
        [],
        `${fqName} failed validators`,
      );
    });
  }

  test('pass-forge is deterministic under seed', async () => {
    const h = tools.get('dsh-tool-pass-forge.generate')!.handler!;
    const a = await h('{"length":12,"count":3,"seed":7}');
    const b = await h('{"length":12,"count":3,"seed":7}');
    assert.equal(a, b);
  });
});
