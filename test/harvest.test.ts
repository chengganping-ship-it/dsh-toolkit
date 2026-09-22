import { strict as assert } from 'node:assert';
import { test, describe } from 'node:test';

const { gateCandidate, recipeFor, renderProbeSource, renderAdapterSource, sampleFor } =
  await import('../src/rsi/harvest.js');

const base = {
  name: 'demo-pkg',
  version: '1.0.0',
  description: 'demo',
  license: 'MIT',
  weeklyDownloads: 1000,
  lastPublish: new Date().toISOString(),
  homepage: null,
  repoUrl: null,
  relevance: 0.9,
  accepted: false,
};

describe('harvest gating (external resources)', () => {
  test('accepts permissive + recent + relevant', () => {
    const c = gateCandidate({ ...base });
    assert.equal(c.accepted, true);
    assert.equal(c.rejectReason, undefined);
  });

  test('rejects non-permissive licenses', () => {
    const c = gateCandidate({ ...base, license: 'GPL-3.0' });
    assert.equal(c.accepted, false);
    assert.match(c.rejectReason!, /license not permissive/);
  });

  test('rejects stale packages', () => {
    const old = new Date(Date.now() - 1000 * 60 * 60 * 24 * 365 * 5).toISOString();
    const c = gateCandidate({ ...base, lastPublish: old });
    assert.equal(c.accepted, false);
    assert.match(c.rejectReason!, /not updated in/);
  });

  test('rejects low relevance', () => {
    const c = gateCandidate({ ...base, relevance: 0.1 });
    assert.equal(c.accepted, false);
    assert.match(c.rejectReason!, /relevance too low/);
  });

  test('maxAgeYears widens the freshness window', () => {
    const threeYears = new Date(Date.now() - 1000 * 60 * 60 * 24 * 365 * 3).toISOString();
    assert.equal(gateCandidate({ ...base, lastPublish: threeYears }, Date.now(), 2).accepted, false);
    assert.equal(gateCandidate({ ...base, lastPublish: threeYears }, Date.now(), 4).accepted, true);
  });
});

describe('adapter recipes', () => {
  test('curated recipes resolve, including scoped names', () => {
    assert.equal(recipeFor('marked')?.tool, 'to_html');
    assert.equal(recipeFor('@scope/nanoid')?.tool, 'ids');
    assert.equal(recipeFor('papaparse')?.tool, 'to_json');
    assert.equal(recipeFor('totally-unknown-pkg'), null);
  });

  test('sampleFor falls back for unknown packages', () => {
    assert.ok(sampleFor('marked').length > 0);
    assert.equal(sampleFor('totally-unknown-pkg'), 'hello world');
  });

  test('generated sources reference the package and stay self-contained', () => {
    const probe = renderProbeSource('some-pkg');
    assert.ok(probe.includes("require(\"some-pkg\")"));
    assert.ok(probe.includes('createRequire'));
    assert.ok(probe.includes("name: 'probe'"));

    const adapter = renderAdapterSource('marked', recipeFor('marked')!);
    assert.ok(adapter.includes("require(\"marked\")"));
    assert.ok(adapter.includes("name: 'to_html'"));
    assert.ok(adapter.includes('免责声明'));
  });
});
