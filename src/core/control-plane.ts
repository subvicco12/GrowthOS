import type { AuditEvent } from './types';
import { createFeatureChangeAuditEvent } from './audit';
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
export async function changeFeatureControl(context:AuthorizationContext,change:FeatureControlChange,repository:TransactionalFeatureControlRepository):Promise<unknown> {
  assertPermission(context,'changeFeatureState'); assertSameSite(context,change.siteId);
  if(!change.reason.trim()) throw new Error('FEATURE_CHANGE_REASON_REQUIRED');
  return repository.transaction(async tx=>{
    const before=await tx.get(change.siteId,change.featureKey);
    const after=await tx.set(change,context.actorId);
    await tx.appendAudit(createFeatureChangeAuditEvent({actorId:context.actorId,siteId:change.siteId,featureKey:change.featureKey,reason:change.reason,before,after}));
    return after;
  });
}
