import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { MySQLManualEvidenceStore } from '../../server/mysql-intelligence-evidence';

const org = '00000000-0000-4000-8000-000000000001', site = '00000000-0000-4000-8000-000000000002';
const actor = '00000000-0000-4000-8000-000000000003';
const input = { organizationId: org, websiteId: site, actorId: actor,
  idempotencyKey: 'synthetic-request', sourceLabel: 'Manual page observation',
  observedAt: '2026-10-24T10:00:00.000Z', expiresAt: '2026-10-25T10:00:00.000Z',
  pages: [{ url: 'https://site.test/pricing', status: 200, indexable: true,
    h1Count: 1, wordCount: 100, internalLinks: 0 }] };
const now = Date.parse('2026-10-24T11:00:00.000Z');
function mock(existing: { id: string; payload_hash: string }[] = [], failAudit = false, siteVisible = true, revoked = false, failCommit = false) {
  const calls: { sql: string; params: unknown[] }[] = [];
  let commits = 0, rollbacks = 0;
  const connection = {
    beginTransaction: async () => {}, commit: async () => { commits++; if (failCommit) throw Error('CONNECTION_LOST'); },
    rollback: async () => { rollbacks++; }, release: () => {},
    execute: async (sql: string, params: unknown[]) => {
      calls.push({ sql, params });
      if (sql.includes('FROM growth_websites')) return [siteVisible ? [{ domain: 'site.test' }] : []];
      if (sql.includes('FROM growth_intelligence_evidence WHERE') && sql.includes('idempotency_key')) return [existing];
      if (sql.includes('FROM growth_intelligence_evidence WHERE') && sql.includes('AND id=?')) return [[{ id: 'evidence' }]];
      if (sql.includes('FROM growth_intelligence_evidence_events')) return [revoked ? [{ id: 'revocation' }] : []];
      if (failAudit && sql.includes('INSERT INTO growth_intelligence_evidence_events')) throw Error('AUDIT_FAILURE');
      return [{ affectedRows: 1 }];
    }
  };
  const store = new MySQLManualEvidenceStore({ getConnection: async () => connection } as never);
  return { store, calls, get commits() { return commits; }, get rollbacks() { return rollbacks; } };
}
test('manual evidence and immutable ingestion event share one transaction and tenant scope', async () => {
  const m = mock();
  const result = await m.store.record(input, now);
  assert.equal(result.duplicate, false); assert.equal(m.commits, 1); assert.equal(m.rollbacks, 0);
  assert.ok(m.calls.some(c => c.sql.includes('growth_intelligence_evidence_events')));
  assert.deepEqual(m.calls[0].params, [org,site]);
  assert.equal(m.calls.find(c => c.sql.includes('INSERT INTO growth_intelligence_evidence\n'))?.params[5], input.sourceLabel);
});
test('audit failure rolls back the evidence insert and cannot report success', async () => {
  const m = mock([], true);
  await assert.rejects(m.store.record(input, now), /AUDIT_FAILURE/);
  assert.equal(m.commits, 0); assert.equal(m.rollbacks, 1);
});
test('identical idempotency key with changed content is refused before insertion', async () => {
  const m = mock([{ id: 'old', payload_hash: '0'.repeat(64) }]);
  await assert.rejects(m.store.record(input, now), /EVIDENCE_IDEMPOTENCY_CONFLICT/);
  assert.equal(m.calls.some(c => c.sql.includes('INSERT INTO growth_intelligence_evidence\n')), false);
});
test('identical replay returns the original identity without a second event', async () => {
  const hash = createHash('sha256').update(JSON.stringify([input.sourceLabel,input.observedAt,input.expiresAt,input.pages])).digest('hex');
  const m = mock([{ id: 'original', payload_hash: hash }]);
  assert.deepEqual(await m.store.record(input, now), { id: 'original', duplicate: true });
  assert.equal(m.calls.some(c => c.sql.includes('INSERT INTO')), false);
});
test('revoked evidence cannot be revived by an identical ingestion replay', async () => {
  const hash = createHash('sha256').update(JSON.stringify([input.sourceLabel,input.observedAt,input.expiresAt,input.pages])).digest('hex');
  const m = mock([{ id: 'original', payload_hash: hash }], false, true, true);
  await assert.rejects(m.store.record(input, now), /EVIDENCE_REVOKED/);
  assert.equal(m.commits, 0); assert.equal(m.rollbacks, 1);
});
test('cross-domain and stale observations are refused', async () => {
  const m = mock();
  await assert.rejects(m.store.record({ ...input, pages: [{ ...input.pages[0], url: 'https://other.test/' }] }, now), /EVIDENCE_SCOPE_MISMATCH/);
  await assert.rejects(m.store.record({ ...input, observedAt: '2026-09-01T00:00:00Z' }, now), /EVIDENCE_TIME_INVALID/);
  assert.equal(m.calls.some(c => c.sql.includes('INSERT INTO growth_intelligence_evidence\n')), false);
});
test('a website outside the selected organization cannot produce evidence or audit writes', async () => {
  const m = mock([], false, false);
  await assert.rejects(m.store.record(input, now), /WEBSITE_NOT_FOUND/);
  assert.equal(m.commits, 0); assert.equal(m.rollbacks, 1);
  assert.equal(m.calls.some(c => c.sql.includes('INSERT INTO')), false);
});
test('revocation appends an event under evidence lock', async () => {
  const m = mock();
  assert.equal(await m.store.revoke({ organizationId: org, websiteId: site, evidenceId: 'evidence', actorId: actor }), true);
  assert.equal(m.commits, 1);
  assert.ok(m.calls.some(c => c.sql.includes("'revoked'") && c.sql.includes('INSERT INTO')));
});
test('lost COMMIT reply on ingestion or revocation is an operator-held unknown outcome', async () => {
  const m = mock([], false, true, false, true);
  await assert.rejects(m.store.record(input, now), /EVIDENCE_COMMIT_UNKNOWN/);
  assert.equal(m.commits, 1);
  const r = mock([], false, true, false, true);
  await assert.rejects(r.store.revoke({ organizationId: org, websiteId: site, evidenceId: 'evidence', actorId: actor }), /EVIDENCE_COMMIT_UNKNOWN/);
  assert.equal(r.commits, 1);
});
