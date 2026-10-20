/** Candidate 010–014 status operations. Caller supplies the sole transaction and independent authorities. */
import {createHash} from 'node:crypto';
import type {PoolConnection,RowDataPacket,ResultSetHeader} from 'mysql2/promise';
import type {FactoryScope} from '../core/content-factory';
import {parseStoredPublicationJob,type BoundProviderObservation,type PublicationJob} from '../core/safe-publication-jobs';
import {decodeStoredContent} from './mysql-content-store';
import {decodeFactoryEnvelope,writeFactoryPublicationTransition} from './mysql-content-factory-store';
import {publicationClaimHash} from './publication-evidence';
import {verifyScopedPublicationObservation,type TrustedDestinationObservationVerifier} from './publication-observation-scope';
type Row=RowDataPacket&Record<string,unknown>;type Params=(string|number|Date|null)[];
const id=(x:unknown):x is string=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(x);
const fail=(s:string):never=>{throw Error(s);};const sha=(s:string)=>createHash('sha256').update(s).digest('hex');
const read=async(c:PoolConnection,sql:string,p:Params)=>{const [r]=await c.execute<Row[]>(sql,p);return r;};
const write=async(c:PoolConnection,sql:string,p:Params,s:string)=>{const [r]=await c.execute<ResultSetHeader>(sql,p);if(r.affectedRows!==1)fail(s);};
export interface PublicationStatusAuthorities {
 readonly capability:'publication-status-authorities-v1';
 /** Verify current issuer/key revocation, session, destination, independent fence, policy and funding. */
 current(c:PoolConnection,scope:FactoryScope,job:PublicationJob,at:string):Promise<{actorId:string}>;
 recheck(c:PoolConnection,scope:FactoryScope,job:PublicationJob,at:string):Promise<void>;
 /** A retryable failure is a trusted, bounded status-probe failure, never a second dispatch. */
 failedProbe(c:PoolConnection,scope:FactoryScope,job:PublicationJob,at:string):Promise<void>;
 observation:TrustedDestinationObservationVerifier;
}
export class MySQLPublicationStatusOperations {
 constructor(private readonly authority:PublicationStatusAuthorities){if(authority?.capability!=='publication-status-authorities-v1'||['current','recheck','failedProbe'].some(k=>typeof authority[k as keyof PublicationStatusAuthorities]!=='function')||authority.observation?.capability!=='trusted-destination-observation-verifier')fail('PUBLICATION_STATUS_AUTHORITY_REQUIRED');}
 private async locked(c:PoolConnection,scope:FactoryScope,jobId:string,expected:number,at:string){
  if(![scope.organizationId,scope.websiteId,scope.contentId,jobId].every(id)||!Number.isSafeInteger(expected)||expected<1||!Number.isFinite(Date.parse(at)))fail('STATUS_SCOPE_DENIED');
  const s:[string,string,string]=[scope.organizationId,scope.websiteId,scope.contentId];
  const content=await read(c,'SELECT version,record_json FROM growth_content_records WHERE organization_id=? AND website_id=? AND id=? FOR UPDATE',s);
  if(content.length!==1)fail('STATUS_CONTENT_UNAVAILABLE');
  const rows=await read(c,'SELECT version,state,content_id,channel,claim_hash,authorization_id,publication_reservation_id,job_json FROM growth_publication_jobs WHERE organization_id=? AND website_id=? AND id=? FOR UPDATE',[scope.organizationId,scope.websiteId,jobId]);
  if(rows.length!==1)fail('STATUS_JOB_UNAVAILABLE');const r=rows[0];const job=parseStoredPublicationJob(typeof r.job_json==='string'?JSON.parse(r.job_json):r.job_json);
  if(job.id!==jobId||job.organizationId!==scope.organizationId||job.websiteId!==scope.websiteId||job.contentId!==scope.contentId||job.contentId!==r.content_id||job.channel!==r.channel||job.version!==expected||Number(r.version)!==expected||job.state!=='awaiting_status'||r.state!==job.state||!job.claim||r.claim_hash!==publicationClaimHash(job.claim)||!id(r.authorization_id)||!id(r.publication_reservation_id)||job.nextProbeAt===null||Date.parse(job.nextProbeAt)>Date.parse(at)||job.probeAttempts>=5)fail('STATUS_JOB_CHANGED');
  const claim=await read(c,'SELECT status,claim_hash,reservation_id FROM growth_publication_claims WHERE organization_id=? AND website_id=? AND content_id=? AND channel=? FOR UPDATE',[...s,job.channel]);
  const binding=await read(c,'SELECT authorization_id,claim_hash,generation_reservation_id,publication_reservation_id,content_version,content_hash,destination_id FROM growth_publication_funding_bindings WHERE organization_id=? AND website_id=? AND content_id=? AND channel=? FOR UPDATE',[...s,job.channel]);
  const funding=await read(c,'SELECT state,operation,content_id FROM growth_quota_reservations_v2 WHERE organization_id=? AND website_id=? AND id=? FOR UPDATE',[scope.organizationId,scope.websiteId,String(r.publication_reservation_id)]);
  const auth=await read(c,'SELECT consumed_at,revoked_at,claim_hash FROM growth_content_authorizations WHERE organization_id=? AND website_id=? AND id=? FOR UPDATE',[scope.organizationId,scope.websiteId,String(r.authorization_id)]);
  if(claim.length!==1||claim[0].status!=='unknown'||claim[0].claim_hash!==r.claim_hash||claim[0].reservation_id!==job.claim!.reservationId||binding.length!==1||binding[0].authorization_id!==r.authorization_id||binding[0].claim_hash!==r.claim_hash||binding[0].generation_reservation_id!==job.claim!.reservationId||binding[0].publication_reservation_id!==r.publication_reservation_id||Number(binding[0].content_version)!==job.contentVersion||binding[0].content_hash!==job.contentHash||binding[0].destination_id!==job.destination.id||funding.length!==1||funding[0].operation!=='publication'||funding[0].content_id!==scope.contentId||!['executing','completed'].includes(String(funding[0].state))||auth.length!==1||auth[0].consumed_at===null||auth[0].revoked_at!==null||auth[0].claim_hash!==r.claim_hash)fail('STATUS_BINDING_OR_FUNDING_DENIED');
  const stored=decodeStoredContent(content[0] as Row&{record_json:string;version:number},...s);
  const factory=Object.hasOwn(stored,'_factory')?decodeFactoryEnvelope(content[0],scope):null;
  const canonical=factory?.record??stored;
  if(canonical.stage!=='publication_unknown'||canonical.version!==job.contentVersion+1||!canonical.eventIds.includes('claim_'+r.claim_hash))fail('STATUS_CONTENT_CHANGED');
  const actor=await this.authority.current(c,scope,job,at);if(!id(actor?.actorId))fail('STATUS_ACTOR_DENIED');
  return {s,job,row:r,canonical,factory,actor:actor.actorId};
 }
 private async save(c:PoolConnection,scope:FactoryScope,job:PublicationJob,next:PublicationJob,event:{eventId:string;payloadHash:string;operation:'probe_failed'|'reconcile';at:string},evidence?:{issuer:string;eventId:string;payloadHash:string}){
  await write(c,'UPDATE growth_publication_jobs SET version=?,state=?,probe_attempts=?,next_probe_at=?,job_json=? WHERE organization_id=? AND website_id=? AND id=? AND version=? AND state=\'awaiting_status\' AND claim_hash=?',
   [next.version,next.state,next.probeAttempts,next.nextProbeAt===null?null:new Date(next.nextProbeAt),JSON.stringify(next),scope.organizationId,scope.websiteId,job.id,job.version,publicationClaimHash(job.claim!)],'STATUS_JOB_CAS_FAILED');
  await write(c,'INSERT INTO growth_publication_job_events (organization_id,website_id,job_id,event_id,resulting_version,operation,occurred_at,payload_hash,observation_issuer,observation_event_id,observation_hash,event_json,content_id,channel,claim_hash,destination_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
   [scope.organizationId,scope.websiteId,job.id,event.eventId,next.version,event.operation,new Date(event.at),event.payloadHash,evidence?.issuer??null,evidence?.eventId??null,evidence?.payloadHash??null,JSON.stringify(event),evidence?scope.contentId:null,evidence?job.channel:null,evidence?publicationClaimHash(job.claim!):null,evidence?job.destination.id:null],'STATUS_EVENT_AUDIT_FAILED');
 }
 async probeFailed(c:PoolConnection,scope:FactoryScope,jobId:string,version:number,eventId:string,at:string):Promise<void>{
  if(!id(eventId))fail('STATUS_EVENT_ID_DENIED');const {job}=await this.locked(c,scope,jobId,version,at);
  await this.authority.failedProbe(c,scope,job,at);await this.authority.recheck(c,scope,job,at);
  const attempts=job.probeAttempts+1,event={eventId,payloadHash:sha(JSON.stringify([scope,jobId,eventId,at,'probe_failed'])),operation:'probe_failed' as const,at};
  const next:PublicationJob={...job,version:version+1,probeAttempts:attempts,state:attempts===5?'operator_review':'awaiting_status',nextProbeAt:attempts===5?null:new Date(Date.parse(at)+Math.min(300000,1000*2**(attempts-1))).toISOString(),journal:[...job.journal,event]};
  await this.save(c,scope,job,next,event);
  await this.authority.recheck(c,scope,next,at);
 }
 async reconcile(c:PoolConnection,scope:FactoryScope,jobId:string,version:number,eventId:string,evidence:BoundProviderObservation,at:string):Promise<'confirmed'|'absent'|'unknown'>{
  if(!id(eventId))fail('STATUS_EVENT_ID_DENIED');const {s,job,canonical,factory,actor}=await this.locked(c,scope,jobId,version,at);
  const signed=await verifyScopedPublicationObservation(job,evidence,at,this.authority.observation);
  const result=signed.result.kind;
  await this.authority.recheck(c,scope,job,at);
  await write(c,'INSERT INTO growth_publication_observations (organization_id,website_id,content_id,channel,issuer,event_id,payload_hash,observation_json) VALUES (?,?,?,?,?,?,?,?)',
   [...s,job.channel,signed.issuer,signed.eventId,signed.payloadHash,JSON.stringify(evidence.observation)],'STATUS_OBSERVATION_REPLAY');
  if(result!=='unknown')await write(c,'UPDATE growth_publication_claims SET status=?,provider_id=?,publication_url=? WHERE organization_id=? AND website_id=? AND content_id=? AND channel=? AND claim_hash=? AND status=\'unknown\'',
   [result==='published'?'confirmed':'absent',result==='published'?signed.result.providerId:null,result==='published'?signed.result.url:null,...s,job.channel,signed.claimHash],'STATUS_CLAIM_CAS_FAILED');
  if(result==='published'){
   const event={kind:'confirm_publication' as const,eventId:'published_'+sha(eventId).slice(0,48),at,providerId:signed.result.providerId,url:signed.result.url,observedAt:evidence.observation.observation.issuedAt};
   if(!factory)fail('STATUS_FACTORY_RECORD_REQUIRED');
   await writeFactoryPublicationTransition(c,factory!,event,{userId:actor,organizationId:scope.organizationId,websiteId:scope.websiteId,role:'admin',trustedProviderEvidence:true});
  }
  const attempts=job.probeAttempts+1,terminal=result!=='unknown',event={eventId,payloadHash:sha(JSON.stringify([scope,jobId,eventId,signed.payloadHash,at])),operation:'reconcile' as const,at};
  const next:PublicationJob={...job,version:version+1,probeAttempts:attempts,state:result==='published'?'confirmed':result==='absent'?'absent':attempts===5?'operator_review':'awaiting_status',nextProbeAt:terminal||attempts===5?null:new Date(Date.parse(at)+Math.min(300000,1000*2**(attempts-1))).toISOString(),journal:[...job.journal,event]};
  await this.save(c,scope,job,next,event,signed);
  await this.authority.recheck(c,scope,next,at);
  return result==='published'?'confirmed':result;
 }
}
