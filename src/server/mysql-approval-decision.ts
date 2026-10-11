import { randomUUID } from 'node:crypto';
import type { RowDataPacket } from 'mysql2/promise';
import { getMySQLPool } from './mysql';

export type ApprovalDecision = 'approved' | 'rejected' | 'deferred';
type Row = RowDataPacket & Record<string, unknown>;
export interface DecisionInput {
  organizationId: string;
  websiteId: string;
  approvalId: string;
  actorId: string;
  idempotencyKey: string;
  decision: ApprovalDecision;
  note?: string;
}

/** Caller MUST authenticate actor and authorize organization before invoking.
 * No WordPress, publishing, AI or other external actions occur here.
 */
export async function decideInternalApproval(input: DecisionInput): Promise<{ decisionId: string; status: ApprovalDecision; replay: boolean }> {
  const { organizationId, websiteId, approvalId, actorId, idempotencyKey, decision } = input;
  if (![organizationId,websiteId,approvalId,actorId].every(v => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)) ||
      !/^[a-zA-Z0-9_-]{8,128}$/.test(idempotencyKey) ||
      !['approved','rejected','deferred'].includes(decision) ||
      (input.note?.length ?? 0) > 2000) throw new Error('INVALID_DECISION');
  const note = input.note?.trim() || null;
  const connection = await getMySQLPool().getConnection();
  try {
    await connection.beginTransaction();
    // All decisions for this organization serialize under one lock.
    const [organizations] = await connection.execute<Row[]>(
      'SELECT id FROM growth_organizations WHERE id=? FOR UPDATE', [organizationId]);
    if (!organizations.length) throw new Error('ORGANIZATION_NOT_FOUND');
    const [previous] = await connection.execute<Row[]>(
      'SELECT id,website_id,approval_id,actor_id,decision,note FROM growth_approval_decisions WHERE organization_id=? AND idempotency_key=?',
      [organizationId,idempotencyKey]);
    if (previous.length) {
      const p = previous[0];
      if (p.website_id !== websiteId || p.approval_id !== approvalId || p.actor_id !== actorId ||
          p.decision !== decision || (p.note ?? null) !== note) throw new Error('IDEMPOTENCY_CONFLICT');
      await connection.commit();
      return { decisionId: String(p.id), status: decision, replay: true };
    }
    const [approvals] = await connection.execute<Row[]>(
      'SELECT status FROM growth_approval_queue WHERE id=? AND organization_id=? AND website_id=? FOR UPDATE',
      [approvalId,organizationId,websiteId]);
    if (!approvals.length) throw new Error('APPROVAL_NOT_FOUND');
    if (approvals[0].status !== 'pending') throw new Error('APPROVAL_ALREADY_DECIDED');
    const decisionId = randomUUID();
    await connection.execute(
      'INSERT INTO growth_approval_decisions (id,organization_id,website_id,approval_id,actor_id,idempotency_key,decision,note) VALUES (?,?,?,?,?,?,?,?)',
      [decisionId,organizationId,websiteId,approvalId,actorId,idempotencyKey,decision,note]);
    await connection.execute(
      'UPDATE growth_approval_queue SET status=?,decided_at=UTC_TIMESTAMP(),decided_by=?,decision_note=? WHERE id=? AND organization_id=? AND website_id=? AND status=?',
      [decision,actorId,note,approvalId,organizationId,websiteId,'pending']);
    await connection.commit();
    return { decisionId, status: decision, replay: false };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
