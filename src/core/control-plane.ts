import { randomUUID } from 'node:crypto';
import type { AuditEvent } from './types';
import { assertPermission, assertSameSite, type AuthorizationContext } from './authorization';
import type { FeatureMode } from './types';

export interface FeatureControlChange { siteId:string; featureKey:string; mode:FeatureMode; reason:string; customerMessage?:string; }
export interface FeatureControlRepository {
  get(siteId:string,featureKey:string):Promise<unknown>;
  set(change:FeatureControlChange,actorId:string):Promise<unknown>;
}
export interface FeatureControlTransaction {
  get(siteId:string,featureKey:string):Promise<unknown>;
  set(change:FeatureControlChange,actorId:string):Promise<unknown>;
  appendAudit(event:AuditEvent):Promise<void>;
}
export interface TransactionalFeatureControlRepository extends FeatureControlRepository {
  transaction<T>(operation:(tx:FeatureControlTransaction)=>Promise<T>):Promise<T>;
}
function auditEvent(context:AuthorizationContext,change:FeatureControlChange,before:unknown,after:unknown):AuditEvent {
  return {id:randomUUID(),actorId:context.actorId,siteId:change.siteId,action:'feature_control.changed',resourceType:'feature_control',resourceId:change.featureKey,reason:change.reason,before,after:{...(typeof after==='object'&&after?after as Record<string,unknown>:{value:after}),reason:change.reason},createdAt:new Date().toISOString()};
}
export async function changeFeatureControl(context:AuthorizationContext,change:FeatureControlChange,repository:TransactionalFeatureControlRepository):Promise<unknown> {
  assertPermission(context,'changeFeatureState'); assertSameSite(context,change.siteId);
  if(!change.reason.trim()) throw new Error('FEATURE_CHANGE_REASON_REQUIRED');
  return repository.transaction(async tx=>{
    const before=await tx.get(change.siteId,change.featureKey);
    const after=await tx.set(change,context.actorId);
    await tx.appendAudit(auditEvent(context,change,before,after));
    return after;
  });
}
