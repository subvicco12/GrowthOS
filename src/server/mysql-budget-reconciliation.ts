import { randomUUID } from 'node:crypto';
import type { RowDataPacket } from 'mysql2/promise';
import { getMySQLPool } from './mysql';
import { exactUnsigned } from './mysql-integer';

type Row = RowDataPacket & Record<string, unknown>;
export type FinalStatus = 'completed' | 'cancelled';

/** Trusted server only; verify operator membership before invoking. */
export async function finalizeMySQLBudget(organizationId: string, reservationId: string, actualCostMinor: number, status: FinalStatus): Promise<void> {
  if (!/^[0-9a-f-]{36}$/i.test(organizationId) || !/^[0-9a-f-]{36}$/i.test(reservationId) || !Number.isSafeInteger(actualCostMinor) || actualCostMinor < 0 ||
      !['completed', 'cancelled'].includes(status)) throw new Error('INVALID_RECONCILIATION');
  const connection = await getMySQLPool().getConnection();
  try {
    await connection.beginTransaction();
    // Lock the organization's budget row FIRST, matching reservation lock order.
    const [org] = await connection.execute<Row[]>(
      'SELECT organization_id FROM growth_organization_budgets WHERE organization_id = ? FOR UPDATE',
      [organizationId]);
    if (!org.length) throw new Error('ORGANIZATION_BUDGET_MISSING');
    const [rows] = await connection.execute<Row[]>(
      'SELECT status, actual_cost_minor, estimated_cost_minor FROM growth_ai_reservations WHERE id = ? AND organization_id = ? FOR UPDATE',
      [reservationId, organizationId]);
    if (!rows.length) throw new Error('RESERVATION_NOT_FOUND');
    const previous = rows[0];
    if (previous.status !== 'reserved') {
      if (previous.status === status && previous.actual_cost_minor !== null && exactUnsigned(previous.actual_cost_minor) === BigInt(actualCostMinor)) {
        await connection.commit();
        return;
      }
      throw new Error('RESERVATION_ALREADY_FINALIZED');
    }
    // Record provider overruns rather than suppressing real charges.
    if (BigInt(actualCostMinor) > exactUnsigned(previous.estimated_cost_minor)) {
      await connection.execute(
        'INSERT INTO growth_budget_incidents (id,organization_id,reservation_id,incident_type,estimated_minor,actual_minor) VALUES (?,?,?,?,?,?)',
        [randomUUID(),organizationId,reservationId,'COST_OVERRUN',previous.estimated_cost_minor,actualCostMinor]);
      // Stop new AI reservations immediately when provider costs exceed the estimate.
      await connection.execute(
        'UPDATE growth_organization_budgets SET globally_paused = TRUE WHERE organization_id = ?',
        [organizationId]);
    }
    await connection.execute(
      'UPDATE growth_ai_reservations SET status = ?, actual_cost_minor = ? WHERE id = ? AND organization_id = ?',
      [status,actualCostMinor,reservationId,organizationId]);
    // An actual provider bill can exhaust a cap even without an individual job overrun.
    const [totals] = await connection.execute<Row[]>(
      "SELECT COALESCE(SUM(CASE WHEN status='reserved' THEN estimated_cost_minor ELSE COALESCE(actual_cost_minor,estimated_cost_minor) END),0) AS used FROM growth_ai_reservations WHERE organization_id=? AND month_start=DATE_FORMAT(UTC_TIMESTAMP(),'%Y-%m-01')",
      [organizationId]);
    const [caps] = await connection.execute<Row[]>(
      'SELECT monthly_limit_minor FROM growth_organization_budgets WHERE organization_id=?',
      [organizationId]);
    if (exactUnsigned(totals[0].used) > exactUnsigned(caps[0].monthly_limit_minor)) {
      await connection.execute(
        'UPDATE growth_organization_budgets SET globally_paused=TRUE WHERE organization_id=?',
        [organizationId]);
    }
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
