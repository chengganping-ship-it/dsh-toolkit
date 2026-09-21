import { strict as assert } from 'node:assert';
import { test, describe } from 'node:test';
import * as path from 'node:path';

process.env['DSH_COMPILED_PLUGINS'] = path.resolve('dist/plugins');

const { lexicalSimilarity, cosine } = await import('../src/graph/relations.js');
const { buildRelationGraph } = await import('../src/graph/relations.js');
const { proposeCandidates: propose } = await import('../src/rsi/engine.js');

describe('relation graph (RAM-inspired open vocabulary)', () => {
  test('lexical fallback similarity is bounded and symmetric', () => {
    const a = 'loan calculator monthly payment';
    const b = 'loan amortization monthly payment';
    const s1 = lexicalSimilarity(a, b);
    const s2 = lexicalSimilarity(b, a);
    assert.equal(s1, s2);
    assert.ok(s1 > 0 && s1 <= 1);
    assert.equal(lexicalSimilarity(a, 'zzz qqq'), 0);
  });

  test('cosine handles zero vectors', () => {
    assert.equal(cosine([0, 0], [1, 1]), 0);
    assert.ok(Math.abs(cosine([1, 0], [1, 0]) - 1) < 1e-9);
  });

  test('graph builds offline (lexical) with nodes and bounded edges', async () => {
    const g = await buildRelationGraph({ useEmbeddings: false, threshold: 0.1, maxEdgesPerNode: 2 });
    assert.ok(g.nodes.length >= 20);
    assert.ok(g.edges.length > 0);
    assert.ok(g.edges.length <= g.nodes.length * 2);
    for (const e of g.edges) {
      assert.ok(e.predicate.length > 0);
      assert.ok(e.score >= 0.1);
    }
  });

  test('candidate proposal composes related tools into pipelines', () => {
    const edges = [
      { source: 'a.x', target: 'b.y', predicate: 'feeds_into', score: 0.9 },
      { source: 'a.x', target: 'a.x', predicate: 'similar_to', score: 0.99 },
      { source: 'c.z', target: 'missing.tool', predicate: 'complements', score: 0.8 },
    ];
    const candidates = propose(edges, ['a.x', 'b.y', 'c.z'], 5);
    assert.equal(candidates.length, 1);
    assert.deepEqual(candidates[0]!.members, ['a.x', 'b.y']);
    assert.ok(candidates[0]!.source.includes('STAGE_A'));
  });
});
