import type { FeatureState, UserRole } from './types';
import { hasMinimumRole } from './authorization';

export interface FeatureDecisionInput {
  role: UserRole;
  requiredRole: UserRole;
  siteStatus: 'active'|'paused'|'maintenance'|'disconnected';
  featureState: FeatureState;
}

export interface FeatureDecision { allowed:boolean; reason?:string; }

export function decideFeatureAccess(input: FeatureDecisionInput): FeatureDecision {
  if (!hasMinimumRole(input.role,input.requiredRole)) return {allowed:false,reason:'INSUFFICIENT_ROLE'};
  if (input.siteStatus === 'disconnected') return {allowed:false,reason:'SITE_DISCONNECTED'};
  if (input.siteStatus === 'paused') return {allowed:false,reason:'SITE_PAUSED'};
  if (input.featureState === 'disabled') return {allowed:false,reason:'FEATURE_DISABLED'};
  if (input.featureState === 'maintenance') return {allowed:false,reason:'FEATURE_MAINTENANCE'};
  return {allowed:true};
}
