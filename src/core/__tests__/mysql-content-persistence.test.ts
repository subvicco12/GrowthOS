import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MySQLContentStore } from '../../server/mysql-content-store';
import { MySQLPublicationClaimStore } from '../../server/mysql-publication-claim-store';
import { createContentRecord, applyContentEvent } from '../content-lifecycle';
import { SyntheticPublicationStatusProbe } from '../synthetic-publication-provider';
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
const scheduled = { ...record, stage:'scheduled', approval:{actorId:'owner1',at:'2026-10-17T00:00:00Z'}, quality:{factual:true,original:true,rightsCleared:true,disclosureChecked:true,ymylReviewed:true,notes:'synthetic'}, schedule:{channel:'site',at:'2026-10-17T00:00:00Z'} };
function claimRows(sql: string): unknown[] {
  if (sql.includes('FROM growth_organization_budgets')) return [{ globally_paused: 0 }];
  if (sql.includes('FROM growth_websites')) return [{ status:'active',verified_at:'date',auto_publish_enabled:1 }];
  if (sql.includes('FROM growth_content_records')) return [{ record_json:JSON.stringify(scheduled) }];
  if (sql.includes('FROM growth_connector_health')) return [{ status:'verified',verified_at:'date' }];
  if (sql.includes('FROM growth_ai_reservations')) return [{ status:'completed' }];
  return [{ affectedRows:1 }];
}
test('publication claim requires persisted gates and unique insert', async () => {
  const m = mock(claimRows);
  assert.equal(await new MySQLPublicationClaimStore(m.pool).claimOnce(claim),true);
  assert.equal(m.state.commits,1);
  assert.match(m.state.statements.join('\n'),/INSERT INTO growth_publication_claims/);
  const disabled = mock(sql => sql.includes('FROM growth_organization_budgets') ? [{ globally_paused:1 }] : claimRows(sql));
  await assert.rejects(() => new MySQLPublicationClaimStore(disabled.pool).claimOnce(claim),/PUBLISHING_DISABLED/);
  assert.equal(disabled.state.rollbacks,1);
  await assert.rejects(() => new MySQLPublicationClaimStore(m.pool).claimOnce({...claim,organizationId:'other'}),/INVALID_PUBLICATION_CLAIM/);
});
test('duplicate claim and SQL failure never return a new claim', async () => {
  const m = mock((sql,params) => { if (sql.includes('INSERT INTO growth_publication_claims')) throw Object.assign(Error('duplicate'),{code:'ER_DUP_ENTRY'}); return claimRows(sql); });
  assert.equal(await new MySQLPublicationClaimStore(m.pool).claimOnce(claim),false);
  assert.equal(m.state.commits,0); assert.equal(m.state.rollbacks,1);
  const unavailable = mock(sql => { if (sql.includes('FROM growth_connector_health')) throw Error('table absent'); return claimRows(sql); });
  await assert.rejects(() => new MySQLPublicationClaimStore(unavailable.pool).claimOnce(claim),/table absent/);
  assert.equal(unavailable.state.commits,0);
});
test('reconciliation is scoped, monotonic, and synthetic probe is offline unknown by default', async () => {
  const probe = new SyntheticPublicationStatusProbe();
  assert.deepEqual(await probe.probe(claim.idempotencyKey),{kind:'unknown'});
  const m = mock(sql => sql.includes('FROM growth_publication_claims') ? [{status:'unknown'}] : [{affectedRows:1}]);
  const store = new MySQLPublicationClaimStore(m.pool);
  assert.equal(await store.reconcile(claim,{kind:'unknown'}),'unknown');
  assert.equal(await store.reconcile(claim,{kind:'published',providerId:'synthetic',url:'https://example.test/post'}),'confirmed');
  assert.match(m.state.statements.join('\n'),/AND status=\?/);
  const conflict = mock(sql => sql.includes('FROM growth_publication_claims') ? [{status:'confirmed',provider_id:'synthetic',publication_url:'https://example.test/post'}] : []);
  await assert.rejects(() => new MySQLPublicationClaimStore(conflict.pool).reconcile(claim,{kind:'absent'}),/PUBLICATION_STATUS_CONFLICT/);
  assert.equal(conflict.state.rollbacks,1);
});
