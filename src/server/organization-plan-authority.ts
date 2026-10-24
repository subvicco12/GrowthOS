import { decideEntitlement, stableRolloutBucket } from '../core/entitlements';
import type { Entitlement, PlanCode } from '../core/types';

export interface PlanAssignment {
  organizationId: string; plan: PlanCode; revision: number; issuer: string;
  evidenceHash: string; expiresAt: string; revokedAt: string | null;
}
/** Implementations must verify independent issuer trust, revocation, and the current durable revision. */
export interface CurrentPlanVerifier {
  readonly capability: 'trusted-plan-verifier';
  assertCurrent(assignment: PlanAssignment): Promise<void>;
}

/** Server-only decision boundary. A plan row, configuration or mock alone never grants access. */
export async function authorizeOrganizationFeature(input: {
  organizationId: string; websiteId: string; userId: string; role: string;
  assignment: PlanAssignment | null; entitlement: Entitlement;
  reservedAndConsumedUnits: number | null; globallyPaused: boolean | null;
  verifier: CurrentPlanVerifier | null; now: number;
}): Promise<ReturnType<typeof decideEntitlement>> {
  const { assignment, verifier } = input;
  if (!verifier || verifier.capability !== 'trusted-plan-verifier') throw Error('PLAN_AUTHORITY_UNAVAILABLE');
  if (!assignment || assignment.organizationId !== input.organizationId ||
      !['free','pro','business'].includes(assignment.plan) ||
      !Number.isSafeInteger(assignment.revision) || assignment.revision < 1 ||
      !/^[a-f0-9]{64}$/.test(assignment.evidenceHash) ||
      !assignment.issuer || assignment.revokedAt ||
      !Number.isFinite(input.now) || !Number.isFinite(Date.parse(assignment.expiresAt)) ||
      Date.parse(assignment.expiresAt) <= input.now) throw Error('PLAN_AUTHORITY_DENIED');
  if (input.entitlement.siteId !== input.websiteId || !input.userId ||
      !['owner','admin','editor','viewer'].includes(input.role) ||
      input.globallyPaused !== false || !Number.isSafeInteger(input.reservedAndConsumedUnits) ||
      input.reservedAndConsumedUnits! < 0) throw Error('PLAN_CONTEXT_DENIED');
  await verifier.assertCurrent(assignment);
  const decision = decideEntitlement(input.entitlement, {
    plan: assignment.plan, isAdmin: input.role === 'owner' || input.role === 'admin',
    stableRolloutBucket: stableRolloutBucket(input.userId,input.websiteId,input.entitlement.featureKey),
    usage: input.reservedAndConsumedUnits!
  });
  if (!decision.allowed || decision.readOnly) throw Error('FEATURE_NOT_ENTITLED');
  return decision;
}
