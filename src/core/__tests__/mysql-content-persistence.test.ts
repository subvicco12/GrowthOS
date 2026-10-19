import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MySQLContentStore } from '../../server/mysql-content-store';
import { MySQLPublicationClaimStore } from '../../server/mysql-publication-claim-store';
import { createContentRecord, applyContentEvent } from '../content-lifecycle';
import { SyntheticPublicationStatusProbe } from '../synthetic-publication-provider';
import { contentSQLFixture } from './helpers/content-sql-fixture';
import type { Pool } from 'mysql2/promise';

const org = 'org1', site = 'site1', id = 'content1';
const record = createContentRecord({ id, organizationId: org, websiteId: site, contentType: 'article' });
function mock(rows: (sql: string, params: unknown[]) => unknown[]) {
  const state = { commits: 0, rollbacks: 0, releases: 0, statements: [] as string[] };
  const connection = {
    beginTransaction: async () => {}, commit: async () => { state.commits++; }, rollback: async () => { state.rollbacks++; }, release: () => { state.releases++; },
    execute: async (sql: string, params: unknown[] = []) => { state.statements.push(sql); const result = rows(sql,params); return [sql.startsWith('SELECT') ? result : result[0], []]; }
  };
  return { state, pool: { getConnection: async () => connection } as unknown as Pool };
}
const actor = { userId: 'owner1', organizationId: org, websiteId: site, role: 'owner' as const };
const research = { kind: 'research' as const, eventId: 'event1', at: '2026-10-18T00:00:00Z', sources: [{ url: 'https://example.test/', observedAt: '2026-10-18T00:00:00Z', claim: 'synthetic' }] };

test('content CAS persists event and record atomically, refuses stale version and tenant scope', async () => {
  const m = mock((sql,params) => sql.includes('FROM growth_content_records') ? (params[0] === org ? [{ version: 0, record_json: JSON.stringify(record) }] : []) : [{ affectedRows: 1 }]);
  const store = new MySQLContentStore(m.pool);
  const next = await applyContentEvent(store,id,0,research,actor);
  assert.equal(next.version,1);
  assert.equal(m.state.commits,1);
  assert.match(m.state.statements.join('\n'),/INSERT INTO growth_content_events/);
  assert.match(m.state.statements.join('\n'),/AND version=\?/);
  await assert.rejects(() => applyContentEvent(store,id,1,research,actor),/CONTENT_VERSION_CONFLICT/);
  await assert.rejects(() => applyContentEvent(store,id,0,research,{...actor,organizationId:'other'}),/CONTENT_NOT_FOUND/);
  assert.equal(m.state.rollbacks,2);
  assert.equal(m.state.releases,3);
});

test('content event duplicate and failed CAS roll back together', async () => {
  for (const failed of ['event','update']) {
    const m = mock(sql => sql.includes('FROM growth_content_records') ? [{ version: 0, record_json: JSON.stringify(record) }] :
      [{ affectedRows: sql.includes(failed === 'event' ? 'INSERT INTO growth_content_events' : 'UPDATE growth_content_records') ? 0 : 1 }]);
    await assert.rejects(() => applyContentEvent(new MySQLContentStore(m.pool),id,0,research,actor),
      failed === 'event' ? /CONTENT_EVENT_REPLAY/ : /CONTENT_VERSION_CONFLICT/);
    assert.equal(m.state.commits,0); assert.equal(m.state.rollbacks,1);
  }
});

const claim = { organizationId: org, websiteId: site, contentId:id, channel:'site', idempotencyKey:`publish:${org}:${site}:${id}:site`, reservationId:'reservation1' };
const scheduled = { ...record, version:5,eventIds:['research','draft','quality','approve','schedule'], stage:'scheduled', approval:{actorId:'owner1',at:'2026-10-17T00:00:00Z'}, quality:{factual:true,original:true,rightsCleared:true,disclosureChecked:true,ymylReviewed:true,notes:'synthetic'}, schedule:{channel:'site',at:'2026-10-17T00:00:00Z'} };
test('publication claim requires transaction-bound authorization; default connector trust denies', async () => {
  const now=Date.now(), db=contentSQLFixture(scheduled as typeof record,now);
  const request={...claim,authorization:db.bridge.request};
  assert.equal(await new MySQLPublicationClaimStore(db.pool,undefined,()=>now,db.bridge.boundary).claimOnce(request),true);
  assert.equal(db.state.commits,1);
  assert.equal(db.snapshot().consumed,true);
  const disabled=contentSQLFixture(scheduled as typeof record,now);disabled.state.paused=1;
  await assert.rejects(()=>new MySQLPublicationClaimStore(disabled.pool).claimOnce(request),/PUBLISHING_DISABLED/);
  const unknown=contentSQLFixture(scheduled as typeof record,now);
  await assert.rejects(()=>new MySQLPublicationClaimStore(unknown.pool,undefined,()=>now).claimOnce(request),/CONNECTOR_TRUST_REVOKED_OR_UNKNOWN/);
  assert.equal(unknown.snapshot().claim,null);
  await assert.rejects(()=>new MySQLPublicationClaimStore(db.pool).claimOnce({...claim,organizationId:'other'}),/INVALID_PUBLICATION_CLAIM/);
});
test('duplicate claim and SQL failure never return a new claim', async () => {
  const now=Date.now(), db=contentSQLFixture(scheduled as typeof record,now);
  const store=new MySQLPublicationClaimStore(db.pool,undefined,()=>now,db.bridge.boundary), request={...claim,authorization:db.bridge.request};
  assert.equal(await store.claimOnce(request),true); assert.equal(await store.claimOnce(request),false);
  const unavailable=contentSQLFixture(scheduled as typeof record,now);unavailable.state.failSQL='FROM growth_connector_attestations';
  await assert.rejects(()=>new MySQLPublicationClaimStore(unavailable.pool,undefined,()=>now,unavailable.bridge.boundary).claimOnce(request),/SYNTHETIC_SQL_FAILURE/);
  assert.equal(unavailable.snapshot().consumed,false);assert.equal(unavailable.snapshot().claim,null);
});
test('unsigned reconciliation is refused before any SQL and synthetic probe defaults unknown', async () => {
  const probe = new SyntheticPublicationStatusProbe();
  assert.deepEqual(await probe.probe(claim.idempotencyKey),{kind:'unknown'});
  const m = mock(() => []);
  await assert.rejects(() => new MySQLPublicationClaimStore(m.pool).reconcile(claim, { kind:'published' } as never),/PUBLICATION_EVIDENCE_INVALID/);
  assert.equal(m.state.statements.length,0);
});
