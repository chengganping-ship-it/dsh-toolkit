import { strict as assert } from 'node:assert';
import { test, describe } from 'node:test';
import * as os from 'node:os';
import * as fs from 'node:fs';
import * as path from 'node:path';

process.chdir(fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-keys-')));

const {
  createKey,
  revokeKey,
  verifyKey,
  appendUsage,
  readUsage,
} = await import('../src/gateway/keys.js');

describe('api keys', () => {
  test('create -> verify -> revoke lifecycle', () => {
    const rec = createKey('alice', 1000);
    assert.ok(rec.key.startsWith('dsh_'));
    assert.equal(verifyKey(rec.key)?.name, 'alice');

    assert.equal(revokeKey('alice'), true);
    assert.equal(verifyKey(rec.key), null);
    assert.equal(revokeKey('nonexistent'), false);
  });

  test('usage ledger aggregates by key and tool', () => {
    appendUsage({ ts: 't', key: 'k1', tool: 'a.b', tokens: 10, status: 200 });
    appendUsage({ ts: 't', key: 'k1', tool: 'a.b', tokens: 20, status: 200 });
    appendUsage({ ts: 't', key: 'k1', tool: 'x.y', tokens: 5, status: 402 });
    const agg = readUsage();
    assert.equal(agg.totalCalls, 3);
    assert.equal(agg.byKey['k1']!.calls, 3);
    assert.equal(agg.byKey['k1']!.tokens, 35);
    assert.equal(agg.byKey['k1']!.errors, 1);
    assert.equal(agg.byTool['a.b']!.tokens, 30);
  });
});
