import test from 'node:test';
import assert from 'node:assert/strict';
import { MySQLPlanUsage, type PlanUsageAuthority } from '../../server/mysql-plan-usage';
import type { Entitlement } from '../types';

const month = '2026-10-01', now = Date.parse('2026-10-24T12:00:00Z');
const policy: Entitlement = { siteId: 'site-a', featureKey: 'offline-preview', mode: 'on',
  freeAccess: true, proAccess: true, businessAccess: true, quotaFree: 1, quotaPro: 2, quotaBusiness: 3,
  rolloutPercent: 100, emergencyKill: false, failSafe: 'deny', updatedAt: '2026-10-24T00:00:00Z' };
const request = { organizationId: 'org-a', websiteId: 'site-a', actorId: 'actor',
  featureKey: 'offline-preview', idempotencyKey: 'synthetic-1', units: 1, maximumCostMinor: 0 };
function fake(options: { paused?: boolean; expired?: boolean; revoked?: boolean; auditFailure?: boolean; commitFailure?: boolean; unknownUsage?: boolean } = {}) {
  let reserved = 0, consumed = 0, commitCount = 0, rollbackCount = 0;
  let currentPolicy = policy;
  let revision = 1;
  const events = new Map<string,{ id: string; website_id: string; feature_key: string; period_start: string;
    period_key: string; units: number; status: string; plan_revision: number }>();
  let tail = Promise.resolve();
  const verifier = { capability: 'trusted-plan-verifier' as const, assertCurrent: async () => { if (options.revoked) throw Error('TRUST_REVOKED'); } };
  const authority: PlanUsageAuthority = { capability: 'leased-plan-usage',
    exclusive: async (_org, work) => { const preceding = tail; let release!: () => void;
      tail = new Promise<void>(resolve => { release = resolve; }); await preceding;
      try { return await work(verifier); } finally { release(); } },
    assertCompensation: async () => {} };
  const statements: string[] = [];
  const pool = { getConnection: async () => {
    let snapshot: { reserved: number; consumed: number; events: Map<string,typeof events extends Map<string,infer V> ? V : never> } | null = null;
    return { beginTransaction: async () => { snapshot = { reserved,consumed,events: new Map([...events].map(([k,v])=>[k,{...v}])) }; },
      commit: async () => { if (options.commitFailure) throw Error('CONNECTION_LOST'); commitCount++; snapshot = null; },
      rollback: async () => { rollbackCount++; if (snapshot) { reserved=snapshot.reserved; consumed=snapshot.consumed;
        events.clear(); for (const [k,v] of snapshot.events) events.set(k,v); } }, release: () => {},
      execute: async (sql: string, params: unknown[] = []) => {
        statements.push(sql);
        if (sql.includes('FROM growth_organizations')) return [params[0]==='org-a' ? [{ id: 'org-a' }] : []];
        if (sql.includes('FROM growth_organization_budgets')) return [[{ globally_paused: options.paused ? 1 : 0, monthly_limit_minor: '0' }]];
        if (sql.includes('FROM growth_plan_assignments')) return [[{ plan: 'free', revision, issuer: 'synthetic',
          evidence_hash: 'a'.repeat(64), expires_at: new Date(options.expired ? now-1 : now+86400000),
          revoked_at: options.revoked ? new Date(now) : null }]];
        if (sql.includes('FROM growth_websites')) return [params[1]==='site-a' ? [{ id: 'site-a' }] : []];
        if (sql.includes('FROM growth_memberships')) return [[{ role: 'owner' }]];
        if (sql.includes('SELECT reserved_units,consumed_units')) return [options.unknownUsage ? [] : [{ reserved_units: String(reserved),consumed_units: String(consumed) }]];
        if (sql.includes('FROM growth_plan_usage_events') && sql.includes('idempotency_key=')) {
          const event=events.get(String(params.at(-1)));
          return [event && event.feature_key===(params.length===4 ? params[2] : params[1]) &&
            (params.length!==4 || event.website_id===params[1]) ? [event] : []];
        }
        if (sql.includes('FROM growth_plan_usage_events') && sql.includes('id=?')) return [[...events.values()].filter(e=>e.id===params[2] && e.website_id===params[1])];
        if (sql.startsWith('UPDATE growth_plan_usage SET reserved_units=reserved_units+')) { reserved+=Number(params[0]); return [{affectedRows:1}]; }
        if (sql.startsWith('UPDATE growth_plan_usage SET reserved_units=reserved_units-?,consumed_units=')) { reserved-=Number(params[0]); consumed+=Number(params[1]); return [{affectedRows:1}]; }
        if (sql.startsWith('UPDATE growth_plan_usage SET reserved_units=reserved_units-?')) { reserved-=Number(params[0]); return [{affectedRows:1}]; }
        if (sql.startsWith('UPDATE growth_plan_usage SET consumed_units=')) { consumed-=Number(params[0]); return [{affectedRows:1}]; }
        if (sql.startsWith('INSERT INTO growth_plan_usage_events')) { events.set(String(params[5]), { id:String(params[0]), website_id:String(params[2]),
          feature_key:String(params[3]), period_start:month, period_key:month, units:Number(params[6]), status:'reserved', plan_revision:Number(params[7]) }); return [{affectedRows:1}]; }
        if (sql.startsWith('UPDATE growth_plan_usage_events SET status=')) { const event=[...events.values()].find(e=>e.id===params[3]);
          if (!event || event.status!==params[4]) return [{affectedRows:0}]; event.status=String(params[0]); return [{affectedRows:1}]; }
        if (sql.includes('INSERT INTO growth_plan_usage_transitions') && options.auditFailure) throw Error('AUDIT_FAILURE');
        return [{affectedRows:1}];
      } };
  } };
  return { store: new MySQLPlanUsage(pool as never,authority,()=>currentPolicy), statements,
    setPolicy(value: Entitlement) { currentPolicy=value; },
    setRevision(value: number) { revision=value; },
    get reserved() { return reserved; }, get consumed() { return consumed; },
    get commits() { return commitCount; }, get rollbacks() { return rollbackCount; } };
}
test('two simulated independent sessions contend for the last quota unit; one reserves', async () => {
  const db = fake();
  const results = await Promise.allSettled([db.store.reserve(request,now), db.store.reserve({ ...request,idempotencyKey:'synthetic-2' },now)]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length, 1);
  assert.equal(results.filter(r=>r.status==='rejected').length, 1);
  assert.equal(db.reserved, 1);
  assert.ok(db.statements.some(s=>s.includes('FOR UPDATE')));
});
test('same request is idempotent, while paid cost, missing authority, pause and expiry refuse', async () => {
  const db=fake(); const first=await db.store.reserve(request,now);
  const replay=await db.store.reserve(request,now);
  assert.equal(replay.id,first.id); assert.equal(replay.duplicate,true); assert.equal(db.reserved,1);
  await assert.rejects(db.store.reserve({ ...request, maximumCostMinor:1 },now),/BILLABLE/);
  await assert.rejects(db.store.reserve({ ...request,units:2 },now),/PLAN_USAGE_REPLAY_DENIED/);
  await assert.rejects(db.store.reserve({ ...request,organizationId:'other-org' },now),/ORGANIZATION_NOT_FOUND/);
  await assert.rejects(db.store.reserve({ ...request,websiteId:'other-site' },now),/FEATURE_POLICY_UNAVAILABLE/);
  await assert.rejects(fake({unknownUsage:true}).store.reserve(request,now),/PLAN_USAGE_UNAVAILABLE/);
  for (const opts of [{paused:true},{expired:true},{revoked:true}]) await assert.rejects(fake(opts).store.reserve(request,now),/PAUSE|AUTHORITY|TRUST/);
  await assert.rejects(new MySQLPlanUsage({} as never,null,()=>policy).reserve(request,now),/PLAN_USAGE_AUTHORITY_UNAVAILABLE/);
});
test('stale plan revision cannot settle or replay a prior reservation', async () => {
  const db=fake(); const {id}=await db.store.reserve(request,now);
  db.setRevision(2);
  await assert.rejects(db.store.reserve(request,now),/PLAN_USAGE_REPLAY_DENIED/);
  await assert.rejects(db.store.transition({ organizationId:'org-a',websiteId:'site-a',actorId:'actor',eventId:id,action:'settle' },now),/PLAN_REVISION_CONFLICT/);
  assert.equal(db.reserved,1); assert.equal(db.consumed,0);
  await db.store.transition({ organizationId:'org-a',websiteId:'site-a',actorId:'actor',eventId:id,action:'cancel' },now);
  assert.equal(db.reserved,0);
});
test('settlement, refund, cancellation and duplicate final events preserve counters', async () => {
  const db=fake(); const { id }=await db.store.reserve(request,now);
  assert.deepEqual(await db.store.transition({ organizationId:'org-a',websiteId:'site-a',actorId:'actor',eventId:id,action:'settle' },now),{duplicate:false});
  assert.equal(db.reserved,0); assert.equal(db.consumed,1);
  assert.deepEqual(await db.store.transition({ organizationId:'org-a',websiteId:'site-a',actorId:'actor',eventId:id,action:'settle' },now),{duplicate:true});
  await db.store.transition({ organizationId:'org-a',websiteId:'site-a',actorId:'actor',eventId:id,action:'refund' },now);
  assert.equal(db.consumed,0);
  assert.deepEqual(await db.store.transition({ organizationId:'org-a',websiteId:'site-a',actorId:'actor',eventId:id,action:'refund' },now),{duplicate:true});
  const other=await db.store.reserve({ ...request,idempotencyKey:'synthetic-2' },now);
  await db.store.transition({ organizationId:'org-a',websiteId:'site-a',actorId:'actor',eventId:other.id,action:'cancel' },now);
  assert.equal(db.reserved,0);
});
test('a feature kill switch denies settlement and recovery lookup is tenant scoped', async () => {
  const db=fake(); const reservation=await db.store.reserve(request,now);
  const recovered=await db.store.readRequestStatus('org-a','site-a','offline-preview',request.idempotencyKey);
  assert.equal(recovered?.id,reservation.id);
  assert.equal(await db.store.readRequestStatus('org-a','other-site','offline-preview',request.idempotencyKey),null);
  db.setPolicy({ ...policy, emergencyKill:true });
  await assert.rejects(db.store.transition({ organizationId:'org-a',websiteId:'site-a',actorId:'actor',eventId:reservation.id,action:'settle' },now),/FEATURE_NOT_ENTITLED/);
  assert.equal(db.reserved,1); assert.equal(db.consumed,0);
  await db.store.transition({ organizationId:'org-a',websiteId:'site-a',actorId:'actor',eventId:reservation.id,action:'cancel' },now);
  assert.equal(db.reserved,0);
});
test('audit failure rolls back and indeterminate COMMIT refuses success', async () => {
  const failed=fake({auditFailure:true});
  await assert.rejects(failed.store.reserve(request,now),/AUDIT_FAILURE/);
  assert.equal(failed.reserved,0); assert.equal(failed.commits,0); assert.equal(failed.rollbacks,1);
  await assert.rejects(fake({commitFailure:true}).store.reserve(request,now),/PLAN_USAGE_COMMIT_UNKNOWN/);
});
