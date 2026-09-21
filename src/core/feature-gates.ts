import type { Entitlement, PlanCode, SiteStatus, UserRole } from './types';
import { hasMinimumRole } from './authorization';

export interface FeatureDecisionInput {
  role: UserRole;
  requiredRole: UserRole;
  siteStatus: SiteStatus;
  plan: PlanCode;
  entitlement: Entitlement;
  usage?: number;
  rolloutBucket?: number;
  readOnlyRequest?: boolean;
}

export interface FeatureDecision { allowed: boolean; reason?: string; customerMessage?: string; }

function planAllowed(plan: PlanCode, entitlement: Entitlement): boolean {
  if (plan === 'free') return entitlement.freeAccess;
  if (plan === 'pro') return entitlement.proAccess;
  return entitlement.businessAccess;
}

function planQuota(plan: PlanCode, entitlement: Entitlement): number | null | undefined {
  if (plan === 'free') return entitlement.quotaFree;
  if (plan === 'pro') return entitlement.quotaPro;
  return entitlement.quotaBusiness;
}

export function decideFeatureAccess(input: FeatureDecisionInput): FeatureDecision {
  const e = input.entitlement;
  if (!hasMinimumRole(input.role, input.requiredRole)) return { allowed: false, reason: 'INSUFFICIENT_ROLE' };
  if (input.siteStatus === 'disconnected') return { allowed: false, reason: 'SITE_DISCONNECTED' };
  if (input.siteStatus === 'paused') return { allowed: false, reason: 'SITE_PAUSED' };
  if (input.siteStatus === 'maintenance') return { allowed: false, reason: 'SITE_MAINTENANCE' };
  if (e.emergencyKill) return { allowed: false, reason: 'EMERGENCY_KILL', customerMessage: e.customerMessage };
  if (e.mode === 'off') return { allowed: false, reason: 'FEATURE_OFF', customerMessage: e.customerMessage };
  if (e.mode === 'maintenance') return { allowed: false, reason: 'FEATURE_MAINTENANCE', customerMessage: e.customerMessage };
  if (e.mode === 'admin_only' && !hasMinimumRole(input.role, 'admin')) return { allowed: false, reason: 'ADMIN_ONLY' };
  if (!planAllowed(input.plan, e)) return { allowed: false, reason: 'PLAN_NOT_ENTITLED' };

  const bucket = input.rolloutBucket ?? 0;
  if (bucket < 0 || bucket > 99) return { allowed: false, reason: 'INVALID_ROLLOUT_BUCKET' };
  if (bucket >= e.rolloutPercent) return { allowed: false, reason: 'ROLLOUT_NOT_INCLUDED' };

  const quota = planQuota(input.plan, e);
  if (quota != null && (input.usage ?? 0) >= quota) return { allowed: false, reason: 'QUOTA_EXCEEDED' };

  return { allowed: true };
}

export function decideOnEntitlementFailure(
  failSafe: Entitlement['failSafe'],
  readOnlyRequest = false,
): FeatureDecision {
  if (failSafe === 'allow_read_only' && readOnlyRequest) return { allowed: true, reason: 'FAIL_SAFE_READ_ONLY' };
  return { allowed: false, reason: 'ENTITLEMENT_UNAVAILABLE' };
}
