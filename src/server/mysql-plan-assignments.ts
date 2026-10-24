import { randomUUID } from 'node:crypto';
import type { Pool, RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import type { PlanAssignment } from './organization-plan-authority';

type Row = RowDataPacket & { plan: PlanAssignment['plan']; revision: string | number;
  issuer: string; evidence_hash: string; expires_at: Date; revoked_at: Date | null };
type Member = RowDataPacket & { role: string };

/** This capability must be supplied by an independently trusted issuer, not an HTTP route or database row. */
export interface PlanIssuerAuthority {
  readonly capability: 'plan-issuer';
  exclusive<T>(organizationId: string, work: () => Promise<T>): Promise<T>;
  assertIssue(assignment: PlanAssignment, actorId: string): Promise<void>;
  assertRevoke(organizationId: string, revision: number, actorId: string): Promise<void>;
}
const integer = (value: number) => Number.isSafeInteger(value) && value > 0;
function mapped(row: Row, organizationId: string): PlanAssignment {
  const revision = Number(row.revision);
  if (!integer(revision)) throw Error('PLAN_REVISION_CORRUPT');
  return { organizationId, plan: row.plan, revision, issuer: row.issuer, evidenceHash: row.evidence_hash,
    expiresAt: new Date(row.expires_at).toISOString(), revokedAt: row.revoked_at ? new Date(row.revoked_at).toISOString() : null };
}

/** Candidate-015 adapter. All writes and their immutable events share one SQL transaction. */
export class MySQLPlanAssignments {
  constructor(private readonly pool: Pick<Pool, 'getConnection'>, private readonly issuer: PlanIssuerAuthority | null) {}
  private requireIssuer(): PlanIssuerAuthority {
    if (this.issuer?.capability !== 'plan-issuer') throw Error('PLAN_ISSUER_UNAVAILABLE');
    return this.issuer;
  }
  async issue(input: { assignment: PlanAssignment; actorId: string; expectedRevision: number | null; now: number }) {
    const issuer = this.requireIssuer(), a = input.assignment;
    if (!a.organizationId || !input.actorId || !['free','pro','business'].includes(a.plan) || !integer(a.revision) ||
        (input.expectedRevision !== null && !integer(input.expectedRevision)) ||
        a.revision !== (input.expectedRevision ?? 0) + 1 || a.revokedAt ||
        !/^[a-f0-9]{64}$/.test(a.evidenceHash) || !a.issuer ||
        !Number.isFinite(input.now) || Date.parse(a.expiresAt) <= input.now) throw Error('PLAN_ISSUE_INVALID');
    return issuer.exclusive(a.organizationId, async () => {
      await issuer.assertIssue(a,input.actorId);
      const c = await this.pool.getConnection(); let commitAttempted = false;
      try {
        await c.beginTransaction();
        const [org] = await c.execute<RowDataPacket[]>('SELECT id FROM growth_organizations WHERE id=? FOR UPDATE',[a.organizationId]);
        if (org.length !== 1) throw Error('ORGANIZATION_NOT_FOUND');
        const [member] = await c.execute<Member[]>(
          'SELECT m.role FROM growth_memberships m JOIN growth_users u ON u.id=m.user_id WHERE m.organization_id=? AND m.user_id=? AND u.disabled=FALSE FOR UPDATE',
          [a.organizationId,input.actorId]);
        if (member.length !== 1 || !['owner','admin'].includes(member[0].role)) throw Error('PLAN_ISSUER_ACTOR_DENIED');
        const [rows] = await c.execute<Row[]>('SELECT plan,revision,issuer,evidence_hash,expires_at,revoked_at FROM growth_plan_assignments WHERE organization_id=? FOR UPDATE',[a.organizationId]);
        if (rows.length > 1 || (rows.length === 0 ? input.expectedRevision !== null :
            rows[0].revoked_at !== null || Number(rows[0].revision) !== input.expectedRevision)) throw Error('PLAN_REVISION_CONFLICT');
        if (rows.length) {
          const [updated] = await c.execute<ResultSetHeader>(
            'UPDATE growth_plan_assignments SET plan=?,revision=?,issuer=?,evidence_hash=?,expires_at=? WHERE organization_id=? AND revision=? AND revoked_at IS NULL',
            [a.plan,a.revision,a.issuer,a.evidenceHash,new Date(a.expiresAt),a.organizationId,input.expectedRevision]);
          if (updated.affectedRows !== 1) throw Error('PLAN_REVISION_CONFLICT');
        } else {
          const [inserted] = await c.execute<ResultSetHeader>(
            'INSERT INTO growth_plan_assignments (organization_id,plan,revision,issuer,evidence_hash,expires_at) VALUES (?,?,?,?,?,?)',
            [a.organizationId,a.plan,a.revision,a.issuer,a.evidenceHash,new Date(a.expiresAt)]);
          if (inserted.affectedRows !== 1) throw Error('PLAN_INSERT_FAILED');
        }
        const [event] = await c.execute<ResultSetHeader>(
        "INSERT INTO growth_plan_assignment_events (id,organization_id,revision,actor_id,plan,action,issuer,evidence_hash) VALUES (?,?,?,?,?,'issued',?,?)",
          [randomUUID(),a.organizationId,a.revision,input.actorId,a.plan,a.issuer,a.evidenceHash]);
        if (event.affectedRows !== 1) throw Error('PLAN_AUDIT_FAILED');
        await issuer.assertIssue(a,input.actorId);
        commitAttempted = true; await c.commit(); return a;
      } catch (error) {
        try { await c.rollback(); } catch { /* COMMIT may be indeterminate; never claim rollback succeeded. */ }
        if (commitAttempted) throw Error('PLAN_COMMIT_UNKNOWN');
        throw error;
      } finally { c.release(); }
    });
  }

  async revoke(input: { organizationId: string; actorId: string; expectedRevision: number; now: number }) {
    const issuer = this.requireIssuer();
    if (!input.organizationId || !input.actorId || !integer(input.expectedRevision) || !Number.isFinite(input.now)) throw Error('PLAN_REVOKE_INVALID');
    return issuer.exclusive(input.organizationId, async () => {
      await issuer.assertRevoke(input.organizationId,input.expectedRevision,input.actorId);
      const c = await this.pool.getConnection(); let commitAttempted = false;
      try {
        await c.beginTransaction();
        const [org] = await c.execute<RowDataPacket[]>('SELECT id FROM growth_organizations WHERE id=? FOR UPDATE',[input.organizationId]);
        if (org.length !== 1) throw Error('ORGANIZATION_NOT_FOUND');
        const [member] = await c.execute<Member[]>(
          'SELECT m.role FROM growth_memberships m JOIN growth_users u ON u.id=m.user_id WHERE m.organization_id=? AND m.user_id=? AND u.disabled=FALSE FOR UPDATE',
          [input.organizationId,input.actorId]);
        if (member.length !== 1 || !['owner','admin'].includes(member[0].role)) throw Error('PLAN_ISSUER_ACTOR_DENIED');
        const [rows] = await c.execute<Row[]>('SELECT plan,revision,issuer,evidence_hash,expires_at,revoked_at FROM growth_plan_assignments WHERE organization_id=? FOR UPDATE',[input.organizationId]);
        if (rows.length !== 1 || Number(rows[0].revision) !== input.expectedRevision || rows[0].revoked_at !== null) throw Error('PLAN_REVISION_CONFLICT');
        const [updated] = await c.execute<ResultSetHeader>(
          'UPDATE growth_plan_assignments SET revoked_at=? WHERE organization_id=? AND revision=? AND revoked_at IS NULL',
          [new Date(input.now),input.organizationId,input.expectedRevision]);
        if (updated.affectedRows !== 1) throw Error('PLAN_REVISION_CONFLICT');
        const [event] = await c.execute<ResultSetHeader>(
          "INSERT INTO growth_plan_assignment_events (id,organization_id,revision,actor_id,plan,action,issuer,evidence_hash) VALUES (?,?,?,?,?,'revoked',?,?)",
          [randomUUID(),input.organizationId,input.expectedRevision,input.actorId,rows[0].plan,rows[0].issuer,rows[0].evidence_hash]);
        if (event.affectedRows !== 1) throw Error('PLAN_AUDIT_FAILED');
        await issuer.assertRevoke(input.organizationId,input.expectedRevision,input.actorId);
        commitAttempted = true; await c.commit(); return true;
      } catch (error) {
        try { await c.rollback(); } catch { /* Unknown COMMIT remains operator-held. */ }
        if (commitAttempted) throw Error('PLAN_COMMIT_UNKNOWN');
        throw error;
      } finally { c.release(); }
    });
  }

  async read(organizationId: string): Promise<PlanAssignment | null> {
    const c = await this.pool.getConnection();
    try {
      const [rows] = await c.execute<Row[]>('SELECT plan,revision,issuer,evidence_hash,expires_at,revoked_at FROM growth_plan_assignments WHERE organization_id=?',[organizationId]);
      if (rows.length > 1) throw Error('PLAN_STATE_CORRUPT');
      return rows.length ? mapped(rows[0],organizationId) : null;
    } finally { c.release(); }
  }
}
