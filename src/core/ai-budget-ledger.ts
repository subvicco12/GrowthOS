import { evaluateProductionBudget, type ProductionPolicy, type ProductionRequest, type BudgetDecision } from './ai-budget-engine';

/**
 * Storage driver must use a single serializable transaction and lock the organization
 * and website budget rows before loading counters or creating a reservation.
 * Callers must never use this module with a non-transactional in-memory driver in production.
 */
export interface BudgetReservation {
  id: string;
  organizationId: string;
  websiteId: string;
  idempotencyKey: string;
  estimatedCostMinor: number;
  contentType: ProductionRequest['contentType'];
  requestedUnits: number;
  status: 'reserved' | 'completed' | 'cancelled';
}
export interface BudgetTransaction {
  findExisting(organizationId: string, idempotencyKey: string): Promise<BudgetReservation | null>;
  loadPolicy(request: ProductionRequest): Promise<ProductionPolicy | null>;
  insertReservation(request: ProductionRequest): Promise<BudgetReservation>;
}
export interface BudgetDatabase {
  /** MUST serialize conflicting organization-wide reservations across websites. */
  withSerializableBudgetTransaction<T>(organizationId: string, websiteId: string, work: (tx: BudgetTransaction) => Promise<T>): Promise<T>;
}
export type ReservationOutcome = { decision: BudgetDecision; reservation?: BudgetReservation; replayed?: boolean };
const denied = (code: BudgetDecision['code']): ReservationOutcome => ({ decision: { allowed: false, code } });
export async function reserveProductionBudget(db: BudgetDatabase, request: ProductionRequest): Promise<ReservationOutcome> {
  if (!request.organizationId || !request.websiteId || !request.idempotencyKey ||
      !Number.isSafeInteger(request.estimatedCostMinor) || request.estimatedCostMinor < 0 ||
      !Number.isSafeInteger(request.maximumJobCostMinor) || request.maximumJobCostMinor < 0 ||
      !Number.isSafeInteger(request.requestedUnits) || request.requestedUnits < 1) {
    return denied('INVALID_REQUEST');
  }
  return db.withSerializableBudgetTransaction(request.organizationId, request.websiteId, async tx => {
    const existing = await tx.findExisting(request.organizationId, request.idempotencyKey);
    // A replay cannot bypass a newly applied pause, revoked connector or disabled site.
    const policy = await tx.loadPolicy(request);
    if (!policy || !policy.websiteActive || !policy.automationEnabled) return denied('DISABLED');
    if (policy.globalPaused) return denied('GLOBAL_PAUSE');
    if (!policy.connectorReady) return denied('CONNECTOR_UNAVAILABLE');
    if (existing) {
      // Idempotency collisions must be rejected rather than replaying another job's reservation.
      if (existing.websiteId !== request.websiteId || existing.organizationId !== request.organizationId ||
          existing.contentType !== request.contentType || existing.requestedUnits !== request.requestedUnits ||
          existing.estimatedCostMinor !== request.estimatedCostMinor) {
        return denied('INVALID_REQUEST');
      }
      if (existing.status !== 'reserved') return denied('DISABLED');
      return { decision: { allowed: true, code: 'APPROVED' }, reservation: existing, replayed: true };
    }
    const decision = evaluateProductionBudget(request, policy);
    if (!decision.allowed) return { decision };
    const reservation = await tx.insertReservation(request);
    return { decision, reservation, replayed: false };
  });
}
