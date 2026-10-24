import { randomUUID } from 'node:crypto';
import type { Pool, RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import type { Entitlement } from '../core/types';
import { authorizeOrganizationFeature, type CurrentPlanVerifier, type PlanAssignment } from './organization-plan-authority';
import { exactUnsigned } from './mysql-integer';

type Row = RowDataPacket & Record<string, unknown>;
export interface PlanUsageAuthority {
  readonly capability: 'leased-plan-usage';
  /** Same independent organization lease domain as plan issuance; spans SQL COMMIT. */
  exclusive<T>(organizationId: string, work: (verifier: CurrentPlanVerifier) => Promise<T>): Promise<T>;
  /** Compensation remains authorized after a revoked/expired plan, without granting new usage. */
  assertCompensation(organizationId: string, eventId: string): Promise<void>;
}
export interface PlanUsageRequest {
  organizationId: string; websiteId: string; actorId: string; featureKey: string;
  idempotencyKey: string; units: number; maximumCostMinor: number;
}
const valid = (n: number) => Number.isSafeInteger(n) && n > 0 && n <= 1000;
const period = (now: number) => new Date(now).toISOString().slice(0,7) + '-01';
const status = (value: unknown) => String(value);

/** Candidate 015 adapter for zero-cost, non-publication plan usage only. No worker calls this. */
export class MySQLPlanUsage {
  constructor(private readonly pool: Pick<Pool,'getConnection'>,
    private readonly authority: PlanUsageAuthority | null,
    private readonly policyFor: ((websiteId: string, featureKey: string) => Entitlement | null) | null) {}
  private requireAuthority() {
    if (this.authority?.capability !== 'leased-plan-usage' || !this.policyFor) throw Error('PLAN_USAGE_AUTHORITY_UNAVAILABLE');
    return this.authority;
  }
  private async transaction<T>(organizationId: string, action: (c: Awaited<ReturnType<Pool['getConnection']>>, verifier: CurrentPlanVerifier) => Promise<T>): Promise<T> {
    const authority = this.requireAuthority();
    return authority.exclusive(organizationId, async verifier => {
      if (verifier?.capability !== 'trusted-plan-verifier') throw Error('PLAN_USAGE_AUTHORITY_UNAVAILABLE');
      const c = await this.pool.getConnection(); let commitAttempted = false;
      try {
        await c.beginTransaction();
        const result = await action(c,verifier);
        commitAttempted = true;
        await c.commit();
        return result;
      } catch (error) {
        try { await c.rollback(); } catch { /* Never infer a failed COMMIT from rollback. */ }
        if (commitAttempted) throw Error('PLAN_USAGE_COMMIT_UNKNOWN');
        throw error;
      } finally { c.release(); }
    });
  }
  private async context(c: Awaited<ReturnType<Pool['getConnection']>>, org: string, site: string, actor: string) {
    // Common lock order for every usage transition: organization -> budget -> plan -> site -> usage -> event.
    const [orgRows] = await c.execute<Row[]>('SELECT id FROM growth_organizations WHERE id=? FOR UPDATE',[org]);
    if (orgRows.length !== 1) throw Error('ORGANIZATION_NOT_FOUND');
    const [budgets] = await c.execute<Row[]>('SELECT globally_paused,monthly_limit_minor FROM growth_organization_budgets WHERE organization_id=? FOR UPDATE',[org]);
    if (budgets.length !== 1) throw Error('BUDGET_UNAVAILABLE');
    const [assignments] = await c.execute<Row[]>(
      'SELECT plan,revision,issuer,evidence_hash,expires_at,revoked_at FROM growth_plan_assignments WHERE organization_id=? FOR UPDATE',[org]);
    if (assignments.length !== 1) throw Error('PLAN_AUTHORITY_DENIED');
    const row = assignments[0];
    const revision = Number(row.revision);
    if (!Number.isSafeInteger(revision) || revision < 1) throw Error('PLAN_REVISION_CORRUPT');
    const assignment: PlanAssignment = { organizationId: org, plan: row.plan as PlanAssignment['plan'], revision,
      issuer: String(row.issuer), evidenceHash: String(row.evidence_hash),
      expiresAt: new Date(row.expires_at as Date).toISOString(), revokedAt: row.revoked_at ? new Date(row.revoked_at as Date).toISOString() : null };
    const [sites] = await c.execute<Row[]>('SELECT id FROM growth_websites WHERE organization_id=? AND id=? FOR UPDATE',[org,site]);
    if (sites.length !== 1) throw Error('WEBSITE_NOT_FOUND');
    const [members] = await c.execute<Row[]>(
      'SELECT m.role FROM growth_memberships m JOIN growth_users u ON u.id=m.user_id WHERE m.organization_id=? AND m.user_id=? AND u.disabled=FALSE FOR UPDATE',
      [org,actor]);
    if (members.length !== 1) throw Error('MEMBERSHIP_DENIED');
    return { assignment, role: String(members[0].role), paused: Number(budgets[0].globally_paused) !== 0 };
  }
  async reserve(request: PlanUsageRequest, now = Date.now()): Promise<{ id: string; duplicate: boolean }> {
    if (!request.organizationId || !request.websiteId || !request.actorId ||
        !/^[A-Za-z0-9_-]{1,80}$/.test(request.featureKey) ||
        !/^[A-Za-z0-9_-]{8,128}$/.test(request.idempotencyKey) || !valid(request.units) ||
        request.maximumCostMinor !== 0 || !Number.isFinite(now)) throw Error('PLAN_USAGE_INVALID_OR_BILLABLE');
    const policy = this.policyFor?.(request.websiteId,request.featureKey);
    if (!policy || policy.siteId !== request.websiteId || policy.featureKey !== request.featureKey) throw Error('FEATURE_POLICY_UNAVAILABLE');
    const month = period(now);
    return this.transaction(request.organizationId, async (c,verifier) => {
      const ctx = await this.context(c,request.organizationId,request.websiteId,request.actorId);
      if (ctx.paused) throw Error('GLOBAL_PAUSE');
      await verifier.assertCurrent(ctx.assignment);
      await c.execute(
        'INSERT INTO growth_plan_usage (organization_id,feature_key,period_start) VALUES (?,?,?) ON DUPLICATE KEY UPDATE organization_id=VALUES(organization_id)',
        [request.organizationId,request.featureKey,month]);
      const [usage] = await c.execute<Row[]>(
        'SELECT reserved_units,consumed_units FROM growth_plan_usage WHERE organization_id=? AND feature_key=? AND period_start=? FOR UPDATE',
        [request.organizationId,request.featureKey,month]);
      if (usage.length !== 1) throw Error('PLAN_USAGE_UNAVAILABLE');
      const reserved = exactUnsigned(usage[0].reserved_units), consumed = exactUnsigned(usage[0].consumed_units);
      const used = reserved + consumed;
      if (used > BigInt(Number.MAX_SAFE_INTEGER)) throw Error('PLAN_USAGE_OVERFLOW');
      const [duplicates] = await c.execute<Row[]>(
        "SELECT id,website_id,DATE_FORMAT(period_start,'%Y-%m-%d') AS period_key,units,status,plan_revision FROM growth_plan_usage_events WHERE organization_id=? AND feature_key=? AND idempotency_key=? FOR UPDATE",
        [request.organizationId,request.featureKey,request.idempotencyKey]);
      // Revoked, expired or changed plans cannot replay an old reservation.
      if (duplicates.length) {
        const d = duplicates[0];
        if (duplicates.length !== 1 || d.website_id !== request.websiteId || d.period_key !== month ||
            exactUnsigned(d.units) !== BigInt(request.units) || Number(d.plan_revision) !== ctx.assignment.revision ||
            status(d.status) !== 'reserved') throw Error('PLAN_USAGE_REPLAY_DENIED');
        await authorizeOrganizationFeature({ organizationId: request.organizationId, websiteId: request.websiteId,
          userId: request.actorId, role: ctx.role, assignment: ctx.assignment, entitlement: policy,
          reservedAndConsumedUnits: Number(used - BigInt(request.units)), globallyPaused: false, verifier, now });
        return { id: String(d.id), duplicate: true };
      }
      const decision = await authorizeOrganizationFeature({ organizationId: request.organizationId, websiteId: request.websiteId,
        userId: request.actorId, role: ctx.role, assignment: ctx.assignment, entitlement: policy,
        reservedAndConsumedUnits: Number(used), globallyPaused: false, verifier, now });
      if (decision.remaining === null || request.units > decision.remaining) throw Error('PLAN_QUOTA_EXCEEDED');
      const id = randomUUID();
      const [updated] = await c.execute<ResultSetHeader>(
        'UPDATE growth_plan_usage SET reserved_units=reserved_units+? WHERE organization_id=? AND feature_key=? AND period_start=?',
        [request.units,request.organizationId,request.featureKey,month]);
      if (updated.affectedRows !== 1) throw Error('PLAN_USAGE_CONFLICT');
      const [event] = await c.execute<ResultSetHeader>(
        "INSERT INTO growth_plan_usage_events (id,organization_id,website_id,feature_key,period_start,idempotency_key,units,status,plan_revision) VALUES (?,?,?,?,?,?,?,'reserved',?)",
        [id,request.organizationId,request.websiteId,request.featureKey,month,request.idempotencyKey,request.units,ctx.assignment.revision]);
      if (event.affectedRows !== 1) throw Error('PLAN_USAGE_EVENT_FAILED');
      const [audit] = await c.execute<ResultSetHeader>(
        "INSERT INTO growth_plan_usage_transitions (id,organization_id,usage_event_id,actor_id,action,units) VALUES (?,?,?,?,'reserved',?)",
        [randomUUID(),request.organizationId,id,request.actorId,request.units]);
      if (audit.affectedRows !== 1) throw Error('PLAN_USAGE_AUDIT_FAILED');
      await verifier.assertCurrent(ctx.assignment);
      return { id, duplicate: false };
    });
  }
  async transition(input: { organizationId: string; websiteId: string; actorId: string; eventId: string;
    action: 'settle'|'cancel'|'refund' }, now = Date.now()): Promise<{ duplicate: boolean }> {
    if (!input.organizationId || !input.websiteId || !input.actorId || !input.eventId ||
        !['settle','cancel','refund'].includes(input.action) ||
        !Number.isFinite(now)) throw Error('PLAN_USAGE_INVALID');
    return this.transaction(input.organizationId, async (c,verifier) => {
      const ctx = await this.context(c,input.organizationId,input.websiteId,input.actorId);
      const action = input.action === 'cancel' ? 'released' : input.action === 'refund' ? 'refunded' : 'settled';
      if (!['owner','admin','editor'].includes(ctx.role)) throw Error('MEMBERSHIP_DENIED');
      if (action === 'settled') {
        if (ctx.paused) throw Error('GLOBAL_PAUSE');
        await verifier.assertCurrent(ctx.assignment);
      } else await this.requireAuthority().assertCompensation(input.organizationId,input.eventId);
      // The event's period and feature are sourced from the database, not the caller.
      const [eventRows] = await c.execute<Row[]>(
        'SELECT id,feature_key,period_start,units,status,plan_revision FROM growth_plan_usage_events WHERE organization_id=? AND website_id=? AND id=?',
        [input.organizationId,input.websiteId,input.eventId]);
      if (eventRows.length !== 1) throw Error('PLAN_USAGE_EVENT_NOT_FOUND');
      const e = eventRows[0];
      const [usage] = await c.execute<Row[]>(
        'SELECT reserved_units,consumed_units FROM growth_plan_usage WHERE organization_id=? AND feature_key=? AND period_start=? FOR UPDATE',
        [input.organizationId,e.feature_key,e.period_start]);
      if (usage.length !== 1) throw Error('PLAN_USAGE_UNAVAILABLE');
      const [locked] = await c.execute<Row[]>(
        'SELECT units,status,plan_revision FROM growth_plan_usage_events WHERE organization_id=? AND website_id=? AND id=? FOR UPDATE',
        [input.organizationId,input.websiteId,input.eventId]);
      if (locked.length !== 1 || status(locked[0].status) !== status(e.status)) throw Error('PLAN_USAGE_CONFLICT');
      if (status(e.status) === action) return { duplicate: true };
      if ((action === 'settled' || action === 'released') && status(e.status) !== 'reserved' ||
          action === 'refunded' && status(e.status) !== 'settled') throw Error('PLAN_USAGE_FINALIZED');
      if (action === 'settled' && Number(e.plan_revision) !== ctx.assignment.revision) throw Error('PLAN_REVISION_CONFLICT');
      const units = exactUnsigned(e.units);
      if (units === 0n || units > BigInt(Number.MAX_SAFE_INTEGER)) throw Error('PLAN_USAGE_CORRUPT');
      const reserved = exactUnsigned(usage[0].reserved_units), consumed = exactUnsigned(usage[0].consumed_units);
      if ((action === 'settled' || action === 'released') && reserved < units || action === 'refunded' && consumed < units) throw Error('PLAN_USAGE_CORRUPT');
      if (action === 'settled') {
        const policy = this.policyFor?.(input.websiteId,String(e.feature_key));
        if (!policy || policy.siteId !== input.websiteId || policy.featureKey !== e.feature_key ||
            reserved + consumed - units > BigInt(Number.MAX_SAFE_INTEGER)) throw Error('FEATURE_POLICY_UNAVAILABLE');
        await authorizeOrganizationFeature({ organizationId: input.organizationId, websiteId: input.websiteId,
          userId: input.actorId, role: ctx.role, assignment: ctx.assignment, entitlement: policy,
          reservedAndConsumedUnits: Number(reserved + consumed - units), globallyPaused: false, verifier, now });
      }
      const [updated] = await c.execute<ResultSetHeader>(
        `UPDATE growth_plan_usage SET ${action === 'settled' ? 'reserved_units=reserved_units-?,consumed_units=consumed_units+?' :
          action === 'released' ? 'reserved_units=reserved_units-?' : 'consumed_units=consumed_units-?'} WHERE organization_id=? AND feature_key=? AND period_start=?`,
        action === 'settled' ? [Number(units),Number(units),input.organizationId,e.feature_key,e.period_start] :
          [Number(units),input.organizationId,e.feature_key,e.period_start]);
      if (updated.affectedRows !== 1) throw Error('PLAN_USAGE_CONFLICT');
      const [changed] = await c.execute<ResultSetHeader>(
        'UPDATE growth_plan_usage_events SET status=? WHERE organization_id=? AND website_id=? AND id=? AND status=?',
        [action,input.organizationId,input.websiteId,input.eventId,e.status]);
      if (changed.affectedRows !== 1) throw Error('PLAN_USAGE_CONFLICT');
      const [audit] = await c.execute<ResultSetHeader>(
        'INSERT INTO growth_plan_usage_transitions (id,organization_id,usage_event_id,actor_id,action,units) VALUES (?,?,?,?,?,?)',
        [randomUUID(),input.organizationId,input.eventId,input.actorId,action,Number(units)]);
      if (audit.affectedRows !== 1) throw Error('PLAN_USAGE_AUDIT_FAILED');
      if (action === 'settled') await verifier.assertCurrent(ctx.assignment);
      else await this.requireAuthority().assertCompensation(input.organizationId,input.eventId);
      return { duplicate: false };
    });
  }
  /** Read-only recovery probe after an indeterminate COMMIT; never dispatch or retry a mutation. */
  async readStatus(organizationId: string, websiteId: string, eventId: string) {
    const c = await this.pool.getConnection();
    try {
      const [rows] = await c.execute<Row[]>(
        'SELECT id,status,units,plan_revision FROM growth_plan_usage_events WHERE organization_id=? AND website_id=? AND id=?',
        [organizationId,websiteId,eventId]);
      if (rows.length > 1) throw Error('PLAN_USAGE_CORRUPT');
      return rows.length ? { id: String(rows[0].id), status: status(rows[0].status),
        units: exactUnsigned(rows[0].units), planRevision: Number(rows[0].plan_revision) } : null;
    } finally { c.release(); }
  }
  /** Recover a reservation whose generated ID was lost during an unknown COMMIT. */
  async readRequestStatus(organizationId: string, websiteId: string, featureKey: string, idempotencyKey: string) {
    if (!organizationId || !websiteId || !/^[A-Za-z0-9_-]{1,80}$/.test(featureKey) ||
        !/^[A-Za-z0-9_-]{8,128}$/.test(idempotencyKey)) throw Error('PLAN_USAGE_INVALID');
    const c = await this.pool.getConnection();
    try {
      const [rows] = await c.execute<Row[]>(
        'SELECT id,status,units,plan_revision FROM growth_plan_usage_events WHERE organization_id=? AND website_id=? AND feature_key=? AND idempotency_key=?',
        [organizationId,websiteId,featureKey,idempotencyKey]);
      if (rows.length > 1) throw Error('PLAN_USAGE_CORRUPT');
      return rows.length ? { id: String(rows[0].id), status: status(rows[0].status),
        units: exactUnsigned(rows[0].units), planRevision: Number(rows[0].plan_revision) } : null;
    } finally { c.release(); }
  }
}
