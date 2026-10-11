import { randomUUID } from 'node:crypto';
import type { RowDataPacket } from 'mysql2/promise';
import type { ProductionRequest } from '../core/ai-budget-engine';
import { getMySQLPool } from './mysql';

type Row = RowDataPacket & Record<string, unknown>;
const integer = (n: number) => Number.isSafeInteger(n) && n >= 0;

/** Call only after server-side authentication and organization membership checks. */
export async function reserveMySQLBudget(request: ProductionRequest): Promise<string> {
  if (!request.organizationId || !request.websiteId || !request.idempotencyKey ||
      request.idempotencyKey.length > 200 || !integer(request.estimatedCostMinor) ||
      !integer(request.maximumJobCostMinor) || !integer(request.requestedUnits) ||
      request.requestedUnits < 1) throw new Error('INVALID_REQUEST');
  const connection = await getMySQLPool().getConnection();
  try {
    await connection.beginTransaction();
    // Serialize all websites of the organization using one shared budget row.
    const [orgRows] = await connection.execute<Row[]>(
      'SELECT monthly_limit_minor, globally_paused FROM growth_organization_budgets WHERE organization_id = ? FOR UPDATE',
      [request.organizationId]);
    const org = orgRows[0];
    if (!org || org.globally_paused) throw new Error('GLOBAL_PAUSE');
    const [siteRows] = await connection.execute<Row[]>(
      'SELECT status, automation_enabled, verified_at FROM growth_websites WHERE organization_id = ? AND id = ? FOR UPDATE',
      [request.organizationId, request.websiteId]);
    const site = siteRows[0];
    if (!site || site.status !== 'active' || !site.automation_enabled || !site.verified_at) throw new Error('WEBSITE_DISABLED');
    const [policyRows] = await connection.execute<Row[]>(
      'SELECT enabled, weekly_limit, monthly_budget_minor, max_job_cost_minor FROM growth_content_policies WHERE organization_id = ? AND website_id = ? AND content_type = ? FOR UPDATE',
      [request.organizationId, request.websiteId, request.contentType]);
    const policy = policyRows[0];
    if (!policy || !policy.enabled) throw new Error('POLICY_DISABLED');
    const [duplicates] = await connection.execute<Row[]>(
      'SELECT id, website_id, content_type, requested_units, estimated_cost_minor, status FROM growth_ai_reservations WHERE organization_id = ? AND idempotency_key = ?',
      [request.organizationId, request.idempotencyKey]);
    if (duplicates.length) {
      const d = duplicates[0];
      if (d.website_id !== request.websiteId || d.content_type !== request.contentType ||
          Number(d.requested_units) !== request.requestedUnits ||
          Number(d.estimated_cost_minor) !== request.estimatedCostMinor) throw new Error('IDEMPOTENCY_CONFLICT');
      if (d.status !== 'reserved') throw new Error('RESERVATION_FINALIZED');
      await connection.commit();
      return String(d.id);
    }
    if (request.estimatedCostMinor > request.maximumJobCostMinor ||
        request.estimatedCostMinor > Number(policy.max_job_cost_minor)) throw new Error('JOB_COST_EXCEEDED');
    const [periodRows] = await connection.query<Row[]>(
      "SELECT DATE_FORMAT(UTC_TIMESTAMP() - INTERVAL WEEKDAY(UTC_TIMESTAMP()) DAY,'%Y-%m-%d') AS week_start, DATE_FORMAT(UTC_TIMESTAMP(),'%Y-%m-01') AS month_start");
    const { week_start: week, month_start: month } = periodRows[0];
    const [weekRows] = await connection.execute<Row[]>(
      "SELECT COALESCE(SUM(requested_units),0) AS used FROM growth_ai_reservations WHERE website_id = ? AND content_type = ? AND week_start = ? AND status IN ('reserved','completed')",
      [request.websiteId, request.contentType, week]);
    if (request.requestedUnits > Number(policy.weekly_limit) - Number(weekRows[0].used)) throw new Error('WEEKLY_QUOTA_EXCEEDED');
    const [siteCost] = await connection.execute<Row[]>(
      "SELECT COALESCE(SUM(CASE WHEN status='reserved' THEN estimated_cost_minor ELSE COALESCE(actual_cost_minor,estimated_cost_minor) END),0) AS used FROM growth_ai_reservations WHERE website_id = ? AND content_type = ? AND month_start = ?",
      [request.websiteId, request.contentType, month]);
    if (request.estimatedCostMinor > Number(policy.monthly_budget_minor) - Number(siteCost[0].used)) throw new Error('WEBSITE_BUDGET_EXCEEDED');
    const [orgCost] = await connection.execute<Row[]>(
      "SELECT COALESCE(SUM(CASE WHEN status='reserved' THEN estimated_cost_minor ELSE COALESCE(actual_cost_minor,estimated_cost_minor) END),0) AS used FROM growth_ai_reservations WHERE organization_id = ? AND month_start = ?",
      [request.organizationId, month]);
    if (request.estimatedCostMinor > Number(org.monthly_limit_minor) - Number(orgCost[0].used)) throw new Error('ORGANIZATION_BUDGET_EXCEEDED');
    const id = randomUUID();
    await connection.execute(
      'INSERT INTO growth_ai_reservations (id,organization_id,website_id,content_type,idempotency_key,week_start,month_start,requested_units,estimated_cost_minor) VALUES (?,?,?,?,?,?,?,?,?)',
      [id,request.organizationId,request.websiteId,request.contentType,request.idempotencyKey,week,month,request.requestedUnits,request.estimatedCostMinor]);
    await connection.commit();
    return id;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
