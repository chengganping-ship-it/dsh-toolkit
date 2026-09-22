import { strict as assert } from 'node:assert';
import { test, describe } from 'node:test';

const { scorePipeline, splitStages, proposeCandidates, isGenerated, loadRsiMemory } =
  await import('../src/rsi/engine.js');

const okOutput = (a: string, b: string) =>
  [
    '# RSI 组合管道结果',
    '',
    '- 谓词：feeds_into',
    `- 阶段 A（a.b）输出长度：${a.length}`,
    '',
    '## 阶段 A 输出',
    a,
    '',
    '## 阶段 B 输出',
    b,
    '',
    '> 免责声明：本输出由 RSI 自动组合的确定性管道生成，仅供参考。',
  ].join('\n');

describe('rsi pipeline fitness', () => {
  test('splits stage sections', () => {
    const s = splitStages(okOutput('AAA', 'BBB'));
    assert.equal(s.a, 'AAA');
    assert.equal(s.b, 'BBB');
    assert.deepEqual(splitStages('no sections'), { a: '', b: '' });
  });

  test('penalizes downstream stage failure', () => {
    const bad = okOutput('good stage a', '管道执行失败：Error');
    const good = okOutput('good stage a', 'good stage b with 42 numbers and steps');
    assert.ok(scorePipeline(bad, 'good stage a', '管道执行失败：Error').score <
      scorePipeline(good, 'good stage a', 'good stage b with 42 numbers and steps').score);
  });

  test('penalizes no-op and probe compositions', () => {
    const same = 'same content here';
    const noop = scorePipeline(okOutput(same, same), same, same);
    assert.ok(noop.notes.some((n) => n.includes('no-op')));

    const probe = scorePipeline(
      okOutput('| 导出 | 类型 |', '导出成员：5'),
      '| 导出 | 类型 |',
      '导出成员：5',
    );
    assert.ok(probe.notes.some((n) => n.includes('introspection probe')));
  });
});

describe('rsi candidate proposal guards', () => {
  test('depth guard blocks generated x generated', () => {
    const edges = [
      { source: 'dsh-tool-rsi-aaaa.pipeline', target: 'dsh-tool-rsi-bbbb.pipeline', predicate: 'complements', score: 0.9 },
      { source: 'dsh-tool-rsi-aaaa.pipeline', target: 'dsh-tool-atomic.tool', predicate: 'feeds_into', score: 0.8 },
    ];
    const c = proposeCandidates(edges, [
      'dsh-tool-rsi-aaaa.pipeline',
      'dsh-tool-rsi-bbbb.pipeline',
      'dsh-tool-atomic.tool',
    ], 5);
    assert.equal(c.length, 1);
    assert.ok(c[0]!.members.includes('dsh-tool-atomic.tool'));
  });

  test('names are stable short hashes', () => {
    const edges = [{ source: 'a.x', target: 'b.y', predicate: 'feeds_into', score: 0.9 }];
    const c1 = proposeCandidates(edges, ['a.x', 'b.y'], 5);
    const c2 = proposeCandidates(edges, ['a.x', 'b.y'], 5);
    assert.equal(c1[0]!.name, c2[0]!.name);
    assert.match(c1[0]!.name, /^dsh-tool-rsi-[0-9a-f]{8}$/);
  });

  test('negative memory suppresses rejected combinations', () => {
    const edges = [{ source: 'a.x', target: 'b.y', predicate: 'feeds_into', score: 0.9 }];
    const avoid = new Set(['a.x+b.y']);
    assert.equal(proposeCandidates(edges, ['a.x', 'b.y'], 5, avoid).length, 0);
  });

  test('isGenerated identifies rsi artifacts', () => {
    assert.equal(isGenerated('dsh-tool-rsi-deadbeef.pipeline'), true);
    assert.equal(isGenerated('dsh-tool-ext-marked.to_html'), false);
  });

  test('loadRsiMemory tolerates a missing lineage file', () => {
    const m = loadRsiMemory('Z:/definitely/not/here');
    assert.equal(m.generations, 0);
    assert.equal(m.avoid.size, 0);
  });
});
