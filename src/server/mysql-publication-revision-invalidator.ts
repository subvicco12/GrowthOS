/** Same-connection invalidation for an already locked content row. No pool or implicit transaction. */
import {createHash} from 'node:crypto';
import type {PoolConnection,ResultSetHeader,RowDataPacket} from 'mysql2/promise';
import type {FactoryScope} from '../core/content-factory';
import {parseStoredPublicationJob,type PublicationJob} from '../core/safe-publication-jobs';
type Row=RowDataPacket&Record<string,unknown>;
const id=(s:unknown):s is string=>typeof s==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(s);
const fail=(code:string):never=>{throw Error(code);};
const sha=(s:string)=>createHash('sha256').update(s).digest('hex');
const rows=async(c:PoolConnection,sql:string,args:(string|number|Date|null)[])=>{const [r]=await c.execute<Row[]>(sql,args);return r;};
const update=async(c:PoolConnection,sql:string,args:(string|number|Date|null)[],code:string)=>{const [r]=await c.execute<ResultSetHeader>(sql,args);if(r.affectedRows!==1)fail(code);};
export interface PublicationRevisionAuthorities {
  readonly capability:'publication-revision-authorities-v1';
  currentActor(connection:PoolConnection,scope:FactoryScope,at:string):Promise<string>;
  verifyRelease(connection:PoolConnection,scope:FactoryScope,reservationId:string,at:string):Promise<{authorizationRevision:string;policyRevision:string;expiresAt:string}>;
}
/** Call only inside the content factory CAS transaction, after locking the scoped content row.
 * Failure rolls back the caller's entire transaction. No claimed or ambiguous work is reset. */
export class MySQLPublicationRevisionInvalidator {
  constructor(private readonly authorities:PublicationRevisionAuthorities){
    if(authorities?.capability!=='publication-revision-authorities-v1'||typeof authorities.currentActor!=='function'||typeof authorities.verifyRelease!=='function')fail('REVISION_AUTHORITIES_REQUIRED');
  }
  async invalidate(c:PoolConnection,scope:FactoryScope,version:number,reason:string,at:string):Promise<void>{
    if(![scope.organizationId,scope.websiteId,scope.contentId].every(id)||!Number.isSafeInteger(version)||version<0||!id(reason)||!Number.isFinite(Date.parse(at)))fail('REVISION_SCOPE_DENIED');
    const s:[string,string,string]=[scope.organizationId,scope.websiteId,scope.contentId];
    const actor=await this.authorities.currentActor(c,scope,at);if(!id(actor))fail('REVISION_ACTOR_DENIED');
    const claims=await rows(c,'SELECT channel FROM growth_publication_claims WHERE organization_id=? AND website_id=? AND content_id=? FOR UPDATE',s);
    const bindings=await rows(c,'SELECT channel FROM growth_publication_funding_bindings WHERE organization_id=? AND website_id=? AND content_id=? FOR UPDATE',s);
    if(claims.length||bindings.length)fail('REVISION_CLAIM_OR_AMBIGUITY_DENIED');
    const jobs=await rows(c,'SELECT id,version,state,content_version,claim_hash,job_json FROM growth_publication_jobs WHERE organization_id=? AND website_id=? AND content_id=? ORDER BY id FOR UPDATE',s);
    const reservations=await rows(c,"SELECT id,version,state,charged_units,charged_minor,started_at FROM growth_quota_reservations_v2 WHERE organization_id=? AND website_id=? AND content_id=? AND operation='publication' ORDER BY id FOR UPDATE",s);
    const authorizations=await rows(c,'SELECT id,content_version,authorization_json,consumed_at,revoked_at FROM growth_content_authorizations WHERE organization_id=? AND website_id=? AND content_id=? ORDER BY id FOR UPDATE',s);
    for(const r of jobs){
      const job=parseStoredPublicationJob(typeof r.job_json==='string'?JSON.parse(r.job_json):r.job_json);
      if(job.organizationId!==scope.organizationId||job.websiteId!==scope.websiteId||job.contentId!==scope.contentId||job.id!==r.id||job.version!==Number(r.version)||job.contentVersion!==Number(r.content_version)||job.contentVersion>version||
        job.state!==r.state||job.claim!==null||r.claim_hash!==null||!['scheduled','cancelled'].includes(job.state))fail('REVISION_JOB_AMBIGUOUS');
    }
    for(const r of reservations)if(!['reserved','cancelled','expired'].includes(String(r.state))||Number(r.charged_units)!==0||Number(r.charged_minor)!==0||r.started_at!==null)fail('REVISION_FUNDING_AMBIGUOUS');
    for(const r of authorizations)if(r.consumed_at!==null||!Number.isSafeInteger(Number(r.content_version))||Number(r.content_version)>version)fail('REVISION_AUTHORIZATION_CONSUMED_OR_FUTURE');
    for(const r of jobs){
      const job=parseStoredPublicationJob(typeof r.job_json==='string'?JSON.parse(r.job_json):r.job_json);if(job.state==='cancelled')continue;
      const event={eventId:'revision_'+sha(job.id+':'+reason),payloadHash:sha(JSON.stringify([s,job.id,version,reason,at])),operation:'cancel',at};
      const next:PublicationJob={...job,state:'cancelled',version:job.version+1,nextProbeAt:null,journal:[...job.journal,event]};
      await update(c,"UPDATE growth_publication_jobs SET version=?,state='cancelled',job_json=? WHERE organization_id=? AND website_id=? AND id=? AND version=? AND state='scheduled' AND claim_hash IS NULL",[next.version,JSON.stringify(next),scope.organizationId,scope.websiteId,job.id,job.version],'REVISION_JOB_CAS_FAILED');
      await update(c,'INSERT INTO growth_publication_job_events (organization_id,website_id,job_id,event_id,resulting_version,operation,occurred_at,payload_hash,event_json) VALUES (?,?,?,?,?,?,?,?,?)',
        [scope.organizationId,scope.websiteId,job.id,event.eventId,next.version,'cancel',new Date(at),event.payloadHash,JSON.stringify(event)],'REVISION_JOB_AUDIT_FAILED');
    }
    for(const r of reservations){
      if(r.state!=='reserved')continue;
      const reservationId=String(r.id),v=Number(r.version);if(!id(reservationId)||!Number.isSafeInteger(v))fail('REVISION_FUNDING_CORRUPT');
      const proof=await this.authorities.verifyRelease(c,scope,reservationId,at);
      if(!id(proof?.authorizationRevision)||!id(proof.policyRevision)||Date.parse(proof.expiresAt)<=Date.parse(at)||Date.parse(proof.expiresAt)>Date.parse(at)+300000)fail('REVISION_RELEASE_AUTHORITY_DENIED');
      await update(c,"UPDATE growth_quota_reservations_v2 SET version=?,state='cancelled' WHERE organization_id=? AND website_id=? AND id=? AND version=? AND state='reserved' AND charged_units=0 AND charged_minor=0",[v+1,scope.organizationId,scope.websiteId,reservationId,v],'REVISION_RELEASE_CAS_FAILED');
      const event={kind:'cancel',reservationId,contentId:scope.contentId,reason,at};
      await update(c,'INSERT INTO growth_quota_events_v2 (organization_id,website_id,reservation_id,request_key,expected_version,resulting_version,operation,occurred_at,actor_kind,actor_id,service_id,authorization_revision,policy_revision,authorized_at,authorization_expires_at,payload_hash,event_json) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
        [scope.organizationId,scope.websiteId,reservationId,'cancel_'+sha(reservationId+':'+reason),v,v+1,'cancel',new Date(at),'user',actor,null,proof.authorizationRevision,proof.policyRevision,new Date(at),new Date(proof.expiresAt),sha(JSON.stringify(event)),JSON.stringify(event)],'REVISION_RELEASE_AUDIT_FAILED');
    }
    for(const r of authorizations){
      if(r.revoked_at!==null)continue;
      const authId=String(r.id);if(!id(authId))fail('REVISION_AUTHORIZATION_CORRUPT');
      await update(c,'UPDATE growth_content_authorizations SET revoked_at=? WHERE organization_id=? AND website_id=? AND id=? AND revoked_at IS NULL AND consumed_at IS NULL',[new Date(at),scope.organizationId,scope.websiteId,authId],'REVISION_AUTHORIZATION_CAS_FAILED');
      await update(c,'INSERT INTO growth_publication_authorization_events (organization_id,website_id,authorization_id,request_key,actor_id,operation,occurred_at,authorization_json) VALUES (?,?,?,?,?,?,?,?)',
        [scope.organizationId,scope.websiteId,authId,'revision_'+sha(authId+':'+reason),actor,'revoke',new Date(at),typeof r.authorization_json==='string'?r.authorization_json:JSON.stringify(r.authorization_json)],'REVISION_AUTHORIZATION_AUDIT_FAILED');
    }
  }
}
