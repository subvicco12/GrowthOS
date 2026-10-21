/** Explicit composition for revision invalidation inside the factory's locked content transaction. */
import type {PoolConnection} from 'mysql2/promise';
import type {FactoryScope} from '../core/content-factory';
import type {FactoryDurableAuthorities} from './mysql-content-factory-store';
import {MySQLPublicationRevisionInvalidator,type PublicationRevisionAuthorities} from './mysql-publication-revision-invalidator';

export function bindFactoryPublicationRevision(
  factory:FactoryDurableAuthorities,
  revision:PublicationRevisionAuthorities
):FactoryDurableAuthorities {
  if(!factory||['policy','evidence','currentApprover'].some(k=>typeof factory[k as keyof FactoryDurableAuthorities]!=='function')||
    revision?.capability!=='publication-revision-authorities-v1'||typeof revision.currentActor!=='function'||typeof revision.verifyRelease!=='function')
    throw Error('FACTORY_REVISION_AUTHORITIES_REQUIRED');
  const invalidator=new MySQLPublicationRevisionInvalidator(revision);
  return {
    policy:(c,s,at)=>factory.policy(c,s,at),
    evidence:(c,k,v,b)=>factory.evidence(c,k,v,b),
    currentApprover:(c,a,s,at)=>factory.currentApprover(c,a,s,at),
    schedule:factory.schedule?(c,s,r,at)=>factory.schedule!(c,s,r,at):undefined,
    invalidate:(c:PoolConnection,s:FactoryScope,v:number,reason:string,at:string)=>invalidator.invalidate(c,s,v,reason,at)
  };
}
