/** Budget reservations are persisted atomically by the storage adapter, never by browser state. */
export type ProductionType = 'youtube_long' | 'youtube_short' | 'reel' | 'social_post' | 'carousel' | 'blog' | 'image' | 'email' | 'audio' | 'custom';
export interface ProductionRequest {
  organizationId: string;
  websiteId: string;
  contentType: ProductionType;
  idempotencyKey: string;
  estimatedCostMinor: number;
  maximumJobCostMinor: number;
  requestedUnits: number;
}
export interface ProductionPolicy {
  websiteActive: boolean;
  automationEnabled: boolean;
  globalPaused: boolean;
  connectorReady: boolean;
  weeklyLimit: number;
  weeklyUsedAndReserved: number;
  websiteMonthlyLimitMinor: number;
  websiteSpentAndReservedMinor: number;
  organizationMonthlyLimitMinor: number;
  organizationSpentAndReservedMinor: number;
}
export type BudgetDecisionCode =
  | 'APPROVED' | 'INVALID_REQUEST' | 'DISABLED' | 'GLOBAL_PAUSE'
  | 'CONNECTOR_UNAVAILABLE' | 'WEEKLY_QUOTA_EXCEEDED'
  | 'WEBSITE_BUDGET_EXCEEDED' | 'ORGANIZATION_BUDGET_EXCEEDED'
  | 'JOB_COST_EXCEEDED';
export interface BudgetDecision { allowed: boolean; code: BudgetDecisionCode; }
const nonnegativeInteger = (n: number) => Number.isSafeInteger(n) && n >= 0;
const result = (code: BudgetDecisionCode): BudgetDecision => ({ allowed: code === 'APPROVED', code });
export function evaluateProductionBudget(request: ProductionRequest, policy: ProductionPolicy): BudgetDecision {
  if (!request.organizationId || !request.websiteId || !request.idempotencyKey ||
      !nonnegativeInteger(request.estimatedCostMinor) || !nonnegativeInteger(request.maximumJobCostMinor) ||
      !Number.isSafeInteger(request.requestedUnits) || request.requestedUnits < 1 ||
      ![policy.weeklyLimit, policy.weeklyUsedAndReserved, policy.websiteMonthlyLimitMinor,
        policy.websiteSpentAndReservedMinor, policy.organizationMonthlyLimitMinor,
        policy.organizationSpentAndReservedMinor].every(nonnegativeInteger)) return result('INVALID_REQUEST');
  if (policy.globalPaused) return result('GLOBAL_PAUSE');
  if (!policy.websiteActive || !policy.automationEnabled) return result('DISABLED');
  if (!policy.connectorReady) return result('CONNECTOR_UNAVAILABLE');
  if (request.estimatedCostMinor > request.maximumJobCostMinor) return result('JOB_COST_EXCEEDED');
  if (request.requestedUnits > policy.weeklyLimit - policy.weeklyUsedAndReserved) return result('WEEKLY_QUOTA_EXCEEDED');
  if (request.estimatedCostMinor > policy.websiteMonthlyLimitMinor - policy.websiteSpentAndReservedMinor) return result('WEBSITE_BUDGET_EXCEEDED');
  if (request.estimatedCostMinor > policy.organizationMonthlyLimitMinor - policy.organizationSpentAndReservedMinor) return result('ORGANIZATION_BUDGET_EXCEEDED');
  return result('APPROVED');
}
/**
 * Storage adapter MUST validate membership, load policy under a transaction/lock,
 * reserve weekly units and both budgets atomically, and deduplicate idempotency keys.
 * This interface is NOT a substitute for a transactional database implementation.
 */
export interface AtomicBudgetStore {
  reserveAtomically(request: ProductionRequest): Promise<{ decision: BudgetDecision; reservationId?: string }>;
  reconcileAtomically(reservationId: string, actualCostMinor: number, actualUnits: number): Promise<void>;
  cancelAtomically(reservationId: string, incurredCostMinor: number): Promise<void>;
}
export async function authorizeProduction(
  request: ProductionRequest, store: AtomicBudgetStore
): Promise<{ decision: BudgetDecision; reservationId?: string }> {
  // Fail closed on missing/invalid scope; never enqueue a billable job before reservation.
  if (!request.organizationId || !request.websiteId || !request.idempotencyKey ||
      !nonnegativeInteger(request.estimatedCostMinor) || !nonnegativeInteger(request.maximumJobCostMinor) ||
      !Number.isSafeInteger(request.requestedUnits) || request.requestedUnits < 1) {
    return { decision: result('INVALID_REQUEST') };
  }
  return store.reserveAtomically(request);
}
