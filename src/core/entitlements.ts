export type PlanCode = 'free'|'pro'|'business';
export type FeatureMode = 'on'|'off'|'maintenance'|'beta'|'admin_only';

export interface Entitlement {
  mode: FeatureMode;
  freeAccess:boolean;
  proAccess:boolean;
  businessAccess:boolean;
  quotaFree:number|null;
  quotaPro:number|null;
  quotaBusiness:number|null;
  rolloutPercent:number;
  emergencyKill:boolean;
  failSafe:'deny'|'allow_read_only';
}

export interface EntitlementContext {
  plan:PlanCode;
  isAdmin:boolean;
  stableRolloutBucket:number;
  usage:number;
}

export interface EntitlementDecision {
  allowed:boolean;
  readOnly:boolean;
  reason:'ALLOWED'|'KILL_SWITCH'|'OFF'|'MAINTENANCE'|'ADMIN_ONLY'|'PLAN_DENIED'|'ROLLOUT'|'QUOTA';
  remaining:number|null;
}

export function decideEntitlement(e:Entitlement,c:EntitlementContext):EntitlementDecision {
  if(e.emergencyKill) return {allowed:false,readOnly:false,reason:'KILL_SWITCH',remaining:0};
  if(e.mode==='off') return {allowed:false,readOnly:false,reason:'OFF',remaining:0};
  if(e.mode==='maintenance') return {allowed:e.failSafe==='allow_read_only',readOnly:e.failSafe==='allow_read_only',reason:'MAINTENANCE',remaining:null};
  if(e.mode==='admin_only'&&!c.isAdmin) return {allowed:false,readOnly:false,reason:'ADMIN_ONLY',remaining:0};
  const access=c.plan==='free'?e.freeAccess:c.plan==='pro'?e.proAccess:e.businessAccess;
  if(!access) return {allowed:false,readOnly:false,reason:'PLAN_DENIED',remaining:0};
  if(c.stableRolloutBucket<0||c.stableRolloutBucket>99||c.stableRolloutBucket>=e.rolloutPercent) return {allowed:false,readOnly:false,reason:'ROLLOUT',remaining:0};
  const quota=c.plan==='free'?e.quotaFree:c.plan==='pro'?e.quotaPro:e.quotaBusiness;
  if(quota!==null&&c.usage>=quota) return {allowed:false,readOnly:false,reason:'QUOTA',remaining:0};
  return {allowed:true,readOnly:false,reason:'ALLOWED',remaining:quota===null?null:Math.max(0,quota-c.usage)};
}
