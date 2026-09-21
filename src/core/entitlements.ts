import { createHash } from 'node:crypto';
import type { Entitlement, FeatureMode, PlanCode } from './types';

export type { FeatureMode, PlanCode };

export interface EntitlementContext {
  plan: PlanCode;
  isAdmin: boolean;
  stableRolloutBucket: number;
  usage: number;
}

export interface EntitlementDecision {
  allowed: boolean;
  readOnly: boolean;
  reason: 'ALLOWED'|'KILL_SWITCH'|'OFF'|'MAINTENANCE'|'ADMIN_ONLY'|'PLAN_DENIED'|'ROLLOUT'|'QUOTA';
  remaining: number|null;
  customerMessage?: string;
}

export function stableRolloutBucket(subjectId: string, siteId: string, featureKey: string): number {
  const digest = createHash('sha256').update(`${siteId}\n${featureKey}\n${subjectId}`).digest();
  return digest.readUInt32BE(0) % 100;
}

export function decideEntitlement(e: Entitlement, c: EntitlementContext): EntitlementDecision {
  const message = e.customerMessage ? { customerMessage: e.customerMessage } : {};
  if (e.emergencyKill) return {allowed:false,readOnly:false,reason:'KILL_SWITCH',remaining:0,...message};
  if (e.mode==='off') return {allowed:false,readOnly:false,reason:'OFF',remaining:0,...message};
  if (e.mode==='maintenance') return {allowed:e.failSafe==='allow_read_only',readOnly:e.failSafe==='allow_read_only',reason:'MAINTENANCE',remaining:null,...message};
  if (e.mode==='admin_only'&&!c.isAdmin) return {allowed:false,readOnly:false,reason:'ADMIN_ONLY',remaining:0,...message};
  const access=c.plan==='free'?e.freeAccess:c.plan==='pro'?e.proAccess:e.businessAccess;
  if (!access) return {allowed:false,readOnly:false,reason:'PLAN_DENIED',remaining:0,...message};
  if (c.stableRolloutBucket<0||c.stableRolloutBucket>99||c.stableRolloutBucket>=e.rolloutPercent) return {allowed:false,readOnly:false,reason:'ROLLOUT',remaining:0,...message};
  const quota=c.plan==='free'?e.quotaFree:c.plan==='pro'?e.quotaPro:e.quotaBusiness;
  if (quota!=null&&c.usage>=quota) return {allowed:false,readOnly:false,reason:'QUOTA',remaining:0,...message};
  return {allowed:true,readOnly:false,reason:'ALLOWED',remaining:quota==null?null:Math.max(0,quota-c.usage),...message};
}

export interface EntitlementOverride {
  mode?: FeatureMode | null;
  accessOverride?: boolean | null;
  quotaOverride?: number | null;
  expiresAt?: string | null;
}

export function applyEntitlementOverride(
  base: Entitlement,
  plan: PlanCode,
  override?: EntitlementOverride | null,
  now = new Date(),
): Entitlement {
  if (!override) return base;
  if (override.expiresAt) {
    const expiresAt = Date.parse(override.expiresAt);
    if (!Number.isFinite(expiresAt) || expiresAt <= now.getTime()) return base;
  }
  if (override.quotaOverride !== undefined && override.quotaOverride !== null && (!Number.isSafeInteger(override.quotaOverride) || override.quotaOverride < 0)) return base;

  const next: Entitlement = {
    ...base,
    mode: override.mode ?? base.mode,
  };

  if (override.accessOverride != null) {
    if (plan === 'free') next.freeAccess = override.accessOverride;
    else if (plan === 'pro') next.proAccess = override.accessOverride;
    else next.businessAccess = override.accessOverride;
  }

  if (override.quotaOverride !== undefined) {
    if (plan === 'free') next.quotaFree = override.quotaOverride;
    else if (plan === 'pro') next.quotaPro = override.quotaOverride;
    else next.quotaBusiness = override.quotaOverride;
  }

  return next;
}
