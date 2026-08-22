import { strict as assert } from 'node:assert';
import { test, describe } from 'node:test';
import { parseSimpleYaml } from '../src/yaml.js';
import { defaultValidators } from '../src/loop/validators.js';
import { selfCritique } from '../src/loop/critic.js';
import { estimateTokens } from '../src/cost/tracker.js';
import { CostGovernor, CostExceededError } from '../src/cost/governor.js';
import { seededRandom } from '../src/agents/orchestrator.js';

describe('yaml parser', () => {
  test('parses flat keys and lists', () => {
    const node = parseSimpleYaml(
      'name: dsh-tool-x\nversion: "1.2.3"\ndescription: hello world\npublic: true\ntools:\n  - a\n  - b\n',
    );
    assert.equal(node['name'], 'dsh-tool-x');
    assert.equal(node['version'], '1.2.3');
    assert.equal(node['public'], 'true');
    assert.deepEqual(node['tools'], ['a', 'b']);
  });
});

describe('validators', () => {
  const vs = defaultValidators();

  test('all pass for well-formed advisory output', () => {
    const out = '# 报告\n\n- 数据显示增长 5%\n\n> 免责声明：仅供参考。'.repeat(6);
    for (const v of vs) {
      const r = v(out);
      assert.ok(r.passed, `${r.validator} should pass`);
    }
  });

  test('hallucination marker fails', () => {
    const r = vs.map((v) => v('lorem ipsum text here')).find((x) => x.validator === 'hallucination-markers')!;
    assert.equal(r.passed, false);
  });

  test('invalid fenced json fails', () => {
    const r = vs
      .map((v) => v('```json\n{broken\n```'))
      .find((x) => x.validator === 'json-valid')!;
    assert.equal(r.passed, false);
  });
});

describe('self critique', () => {
  test('rich output scores higher than empty', () => {
    const rich =
      '# 计划\n\n1. 第一步投入 100 万元。\n2. 第二步降低 30% 成本。\n3. 第三步回收期 4 年。'.repeat(8);
    assert.ok(selfCritique(rich).overall > selfCritique('').overall);
  });
});

describe('cost governor', () => {
  test('token estimation is chars/4', () => {
    assert.equal(estimateTokens('a'.repeat(401)), 101);
  });

  test('blocks and reports EXCEEDED', () => {
    const g = new CostGovernor({ plugin: 300 });
    let blocked = false;
    try {
      g.charge({ userKey: 'u', pluginKey: 'p', texts: ['a'.repeat(1600)] });
    } catch (e) {
      blocked = e instanceof CostExceededError;
    }
    assert.ok(blocked);
    assert.equal(g.status('plugin', 'p').state, 'EXCEEDED');
  });

  test('state machine thresholds', () => {
    const g = new CostGovernor({ user: 1000 });
    g.charge({ userKey: 'u1', pluginKey: 'p', texts: ['a'.repeat(2800)] }); // 700
    assert.equal(g.status('user', 'u1').state, 'WARNING');
    g.charge({ userKey: 'u1', pluginKey: 'p', texts: ['a'.repeat(800)] }); // +200=900
    assert.equal(g.status('user', 'u1').state, 'CRITICAL');
  });
});

describe('seeded prng', () => {
  test('deterministic sequence', () => {
    const a = seededRandom(42);
    const b = seededRandom(42);
    for (let i = 0; i < 10; i++) assert.equal(a(), b());
  });
});
