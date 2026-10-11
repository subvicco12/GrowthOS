import { randomUUID } from 'node:crypto';
import type { RowDataPacket } from 'mysql2/promise';
import { getMySQLPool } from './mysql';

type Row = RowDataPacket & Record<string, unknown>;
export type FinalStatus = 'completed' | 'cancelled';

/** Trusted server only; verify operator membership before invoking. */
export async function finalizeMySQLBudget(reservationId: string, actualCostMinor: number, status: FinalStatus): Promise<void> {
  if (!reservationId || !Number.isSafeInteger(actualCostMinor) || actualCostMinor < 0 ||
      !['completed', 'cancelled'].includes(status)) throw new Error('INVALID_RECONCILIATION');
  const connection = await getMySQLPool().getConnection();
  try {
    await connection.beginTransaction();
    // Lock the organization's budget row FIRST, matching reservation lock order.
    const [lookup] = await connection.execute<Row[]>(
      'SELECT organization_id FROM growth_ai_reservations WHERE id = ?', [reservationId]);
    if (!lookup.length) throw new Error('RESERVATION_NOT_FOUND');
    const organizationId = String(lookup[0].organization_id);
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
      if (previous.status === status && Number(previous.actual_cost_minor) === actualCostMinor) {
        await connection.commit();
        return;
      }
      throw new Error('RESERVATION_ALREADY_FINALIZED');
    }
    // Record provider overruns rather than suppressing real charges.
    if (actualCostMinor > Number(previous.estimated_cost_minor)) {
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
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
