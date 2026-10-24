import test from 'node:test';
import assert from 'node:assert/strict';
import { MySQLPlanAssignments, type PlanIssuerAuthority } from '../../server/mysql-plan-assignments';
import type { PlanAssignment } from '../../server/organization-plan-authority';

const assignment: PlanAssignment = { organizationId: 'org-a', plan: 'free', revision: 1,
  issuer: 'synthetic-only', evidenceHash: 'a'.repeat(64), expiresAt: '2026-11-01T00:00:00Z', revokedAt: null };
const now = Date.parse('2026-10-24T00:00:00Z');
const issuer: PlanIssuerAuthority = { capability: 'plan-issuer', exclusive: async (_org, work) => work(),
  assertIssue: async () => {}, assertRevoke: async () => {} };
function mock(options: { existing?: boolean; revoked?: boolean; role?: string; auditFailure?: boolean; commitFailure?: boolean } = {}) {
  const sql: string[] = []; let commits = 0, rollbacks = 0;
  const row = { plan: 'free', revision: 1, issuer: assignment.issuer, evidence_hash: assignment.evidenceHash,
    expires_at: new Date(assignment.expiresAt), revoked_at: options.revoked ? new Date(now) : null };
  const connection = { beginTransaction: async () => {}, commit: async () => { if (options.commitFailure) throw Error('CONNECTION_LOST'); commits++; },
    rollback: async () => { rollbacks++; }, release: () => {}, execute: async (query: string, params: unknown[]) => {
      sql.push(query); assert.ok(params.every(p => p !== undefined));
      if (query.includes('FROM growth_organizations')) return [[{ id: 'org-a' }]];
      if (query.includes('FROM growth_memberships')) return [[{ role: options.role ?? 'owner' }]];
      if (query.includes('FROM growth_plan_assignments')) return [options.existing ? [row] : []];
      if (query.includes('INSERT INTO growth_plan_assignment_events') && options.auditFailure) throw Error('AUDIT_FAILURE');
      return [{ affectedRows: 1 }];
    } };
  const store = new MySQLPlanAssignments({ getConnection: async () => connection } as never,issuer);
  return { store, sql, get commits() { return commits; }, get rollbacks() { return rollbacks; } };
}
test('first issuance and CAS upgrade write a plan and immutable audit in one transaction', async () => {
  const first = mock(); await first.store.issue({ assignment, actorId: 'actor', expectedRevision: null, now });
  assert.equal(first.commits, 1); assert.ok(first.sql.some(s => s.includes('INSERT INTO growth_plan_assignments')));
  assert.ok(first.sql.some(s => s.includes('growth_plan_assignment_events')));
  const next = mock({ existing: true });
  await next.store.issue({ assignment: { ...assignment, plan: 'pro', revision: 2 }, actorId: 'actor', expectedRevision: 1, now });
  assert.ok(next.sql.some(s => s.includes('UPDATE growth_plan_assignments SET plan=')));
});
test('missing issuer, unauthorized actor, stale revision, and revoked row refuse writes', async () => {
  await assert.rejects(new MySQLPlanAssignments({} as never,null).issue({ assignment, actorId: 'actor', expectedRevision: null, now }), /PLAN_ISSUER_UNAVAILABLE/);
  for (const options of [{ role: 'viewer' }, { existing: true }, { existing: true, revoked: true }]) {
    const m = mock(options);
    await assert.rejects(m.store.issue({ assignment, actorId: 'actor', expectedRevision: null, now }), /DENIED|CONFLICT/);
    assert.equal(m.commits, 0); assert.equal(m.rollbacks, 1);
  }
});
test('revocation is version-bound, audited, and repeated revocation fails closed', async () => {
  const m = mock({ existing: true });
  assert.equal(await m.store.revoke({ organizationId: 'org-a', actorId: 'actor', expectedRevision: 1, now }), true);
  assert.ok(m.sql.some(s => s.includes("'revoked'")));
  const replay = mock({ existing: true, revoked: true });
  await assert.rejects(replay.store.revoke({ organizationId: 'org-a', actorId: 'actor', expectedRevision: 1, now }), /PLAN_REVISION_CONFLICT/);
});
test('audit failure rolls back; uncertain COMMIT is operator-held', async () => {
  const audit = mock({ auditFailure: true });
  await assert.rejects(audit.store.issue({ assignment, actorId: 'actor', expectedRevision: null, now }), /AUDIT_FAILURE/);
  assert.equal(audit.commits, 0); assert.equal(audit.rollbacks, 1);
  const unknown = mock({ commitFailure: true });
  await assert.rejects(unknown.store.issue({ assignment, actorId: 'actor', expectedRevision: null, now }), /PLAN_COMMIT_UNKNOWN/);
});
