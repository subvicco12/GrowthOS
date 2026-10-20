/** Candidate 010–013 SQL participant. No default pool, trust anchor, budget authority or publisher. */
import {createHash} from 'node:crypto';
import type {Pool,PoolConnection,RowDataPacket,ResultSetHeader} from 'mysql2/promise';
import type {FactoryScope,FactoryContext} from '../core/content-factory';
import type {ContentRecord} from '../core/content-lifecycle';
import {transitionContent} from '../core/content-lifecycle';
import {parseStoredPublicationJob,type PublicationJob} from '../core/safe-publication-jobs';
import type {PublicationClaim} from '../core/publication-handoff';
import {publicationAuthorizationSchema,contentAuthorizationHash} from '../core/publication-authorization';
import type {AtomicPublicationTransaction,AtomicPublicationAuthorization,IndependentPublicationFence} from '../core/publication-atomic-integration';
import {decodeStoredContent,writeContentTransition} from './mysql-content-store';
import {MySQLPublicationAuthorization,type PublicationAuthorizationReceipt} from './mysql-publication-authorization';
import {publicationClaimHash} from './publication-evidence';
import {MySQLPublicationJobRecoveryReader} from './mysql-publication-job-recovery-reader';
import type {CertifiedAtomicParticipants} from './mysql-atomic-publication-transaction';
type Row=RowDataPacket&Record<string,unknown>;type Param=string|number|Date|null;
const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
const valid=(s:unknown):s is string=>typeof s==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(s);
const fail=(s:string):never=>{throw Error(s);};
const one=(rs:Row[],s:string):Row=>rs.length===1?rs[0]:fail(s);
const read=async(c:PoolConnection,sql:string,p:Param[])=>{const [rs]=await c.execute<Row[]>(sql,p);return rs;};
const write=async(c:PoolConnection,sql:string,p:Param[],s:string)=>{const [r]=await c.execute<ResultSetHeader>(sql,p);if(r.affectedRows!==1)fail(s);};
const iso=(v:unknown)=>v instanceof Date?v.toISOString():String(v);

/** These must be independently reviewed real services; no callback is inferred from configuration. */
export interface PublicationSqlAuthorities {
 capability:'publication-atomic-authorities-v1';
 assertPinnedSchema(c:PoolConnection):Promise<void>;
 verifyBudget(c:PoolConnection,scope:FactoryScope,record:ContentRecord,fundingId:string,at:string):Promise<void>;
 recheckBudget(c:PoolConnection,scope:FactoryScope,record:ContentRecord,fundingId:string,at:string):Promise<void>;
 independentWitness(fence:IndependentPublicationFence):Promise<{generation:number;leaseId:string}>;
}

export class MySQLPublicationSqlParticipants implements CertifiedAtomicParticipants {
 readonly capability='certified-010-013-atomic-participants' as const;
 private readonly reader:MySQLPublicationJobRecoveryReader;
 constructor(private readonly pool:Pick<Pool,'getConnection'>,private readonly verifier:MySQLPublicationAuthorization,private readonly authority:PublicationSqlAuthorities){
  if(!pool?.getConnection||!verifier||authority?.capability!=='publication-atomic-authorities-v1'||
    ['assertPinnedSchema','verifyBudget','recheckBudget','independentWitness'].some(k=>typeof authority[k as keyof PublicationSqlAuthorities]!=='function'))fail('PUBLICATION_SQL_AUTHORITIES_REQUIRED');
  this.reader=new MySQLPublicationJobRecoveryReader(pool);
 }
 async assertCompatible(c:PoolConnection){await this.authority.assertPinnedSchema(c);}
 async readCommittedIdentity(scope:FactoryScope,jobId:string):Promise<'committed'|'absent'|'indeterminate'>{
  try{const snapshot=await this.reader.inspect(scope,jobId);return snapshot.job.claim?'committed':'absent';}catch{return 'indeterminate';}
 }
 open(c:PoolConnection,scope:FactoryScope,jobId:string,fence:IndependentPublicationFence):AtomicPublicationTransaction {
  if(![scope.organizationId,scope.websiteId,scope.contentId,jobId].every(valid))fail('PUBLICATION_SQL_SCOPE_DENIED');
  const s:[string,string,string]=[scope.organizationId,scope.websiteId,scope.contentId],j:[string,string,string]=[scope.organizationId,scope.websiteId,jobId];
  let job:PublicationJob|undefined,record:ContentRecord|undefined,receipt:PublicationAuthorizationReceipt|undefined,authRow:Row|undefined,funding:Row|undefined;
  let budget:Row|undefined,site:Row|undefined,sessionHash='',fundingId='',claimHash='',policyRevision='';
  const context=()=>{if(!job||!record||!receipt||!authRow||!funding)fail('PUBLICATION_SQL_CONTEXT_REQUIRED');};
  return {
   lockScope:async input=>{
    if(input.id!==jobId||input.organizationId!==scope.organizationId||input.websiteId!==scope.websiteId||input.contentId!==scope.contentId||input.state!=='scheduled'||input.claim!==null)fail('PUBLICATION_SQL_SCOPE_DENIED');
    budget=one(await read(c,'SELECT globally_paused,monthly_limit_minor FROM growth_organization_budgets WHERE organization_id=? FOR UPDATE',[scope.organizationId]),'PUBLICATION_BUDGET_UNAVAILABLE');
    site=one(await read(c,'SELECT status,verified_at,automation_enabled,auto_publish_enabled FROM growth_websites WHERE organization_id=? AND id=? FOR UPDATE',[scope.organizationId,scope.websiteId]),'PUBLICATION_SITE_UNAVAILABLE');
    if(Number(budget.globally_paused)!==0||site.status!=='active'||!site.verified_at||Number(site.automation_enabled)!==1||Number(site.auto_publish_enabled)!==1)fail('PUBLISHING_DISABLED');
    const row=one(await read(c,'SELECT content_id,channel,content_version,content_hash,destination_id,destination_revision,destination_target_hash,version,state,job_json,authorization_id,claim_hash,publication_reservation_id FROM growth_publication_jobs WHERE organization_id=? AND website_id=? AND id=? FOR UPDATE',j),'PUBLICATION_JOB_NOT_FOUND');
    job=parseStoredPublicationJob(typeof row.job_json==='string'?JSON.parse(row.job_json):row.job_json);
    if(row.content_id!==scope.contentId||row.channel!==input.channel||Number(row.content_version)!==input.contentVersion||row.content_hash!==input.contentHash||row.destination_id!==input.destination.id||row.destination_revision!==input.destination.revision||row.destination_target_hash!==hash(input.destination.target)||
      job.organizationId!==scope.organizationId||job.websiteId!==scope.websiteId||job.contentId!==scope.contentId||job.id!==jobId||job.channel!==input.channel||job.version!==input.version||Number(row.version)!==job.version||row.state!==job.state||job.state!=='scheduled'||job.claim!==null||
      job.contentHash!==input.contentHash||job.contentVersion!==input.contentVersion||JSON.stringify(job.destination)!==JSON.stringify(input.destination)||row.authorization_id!==null||row.claim_hash!==null||row.publication_reservation_id!==null)fail('PUBLICATION_JOB_CHANGED');
   },
   loadContent:async input=>{
    if(!job||input.id!==job.id)fail('PUBLICATION_JOB_NOT_LOCKED');
    const row=one(await read(c,'SELECT version,record_json FROM growth_content_records WHERE organization_id=? AND website_id=? AND id=? FOR UPDATE',s),'PUBLICATION_CONTENT_NOT_FOUND');
    const found=decodeStoredContent(row as Row&{record_json:string;version:number},...s);
    if(Object.hasOwn(found,'_factory')||found.stage!=='scheduled'||found.version!==job!.contentVersion||contentAuthorizationHash(found)!==job!.contentHash)fail('PUBLICATION_CONTENT_CHANGED');
    record=found;return found;
   },
   authorize:async(input,ctx:FactoryContext,at)=>{
    if(!job||!record||input.id!==job.id||ctx.organizationId!==scope.organizationId||!/^[a-f0-9]{64}$/.test(ctx.sessionHash))fail('PUBLICATION_SESSION_DENIED');
    sessionHash=ctx.sessionHash;
    authRow=one(await read(c,'SELECT id,authorization_json,reservation_id,approval_event_id FROM growth_content_authorizations WHERE organization_id=? AND website_id=? AND content_id=? AND content_version=? AND channel=? AND destination_id=? AND consumed_at IS NULL AND revoked_at IS NULL FOR UPDATE',[...s,job!.contentVersion,job!.channel,job!.destination.id]),'PUBLICATION_AUTHORIZATION_NOT_UNIQUE');
    const a=publicationAuthorizationSchema.parse(typeof authRow.authorization_json==='string'?JSON.parse(authRow.authorization_json):authRow.authorization_json);
    const p=one(await read(c,'SELECT enabled,auto_publish FROM growth_content_policies WHERE organization_id=? AND website_id=? AND content_type=? FOR UPDATE',[scope.organizationId,scope.websiteId,record!.contentType]),'PUBLICATION_POLICY_UNAVAILABLE');
    const rev=one(await read(c,'SELECT revision,feature_enabled FROM growth_publication_policy_revisions WHERE organization_id=? AND website_id=? AND content_type=? FOR UPDATE',[scope.organizationId,scope.websiteId,record!.contentType]),'PUBLICATION_POLICY_UNAVAILABLE');
    policyRevision=String(rev.revision);
    const claim:PublicationClaim={...scope,channel:job!.channel,reservationId:a.reservationId,idempotencyKey:`publish:${scope.organizationId}:${scope.websiteId}:${scope.contentId}:${job!.channel}`,authorization:{authorizationId:a.id,sessionTokenHash:sessionHash,contentVersion:record!.version,destinationId:job!.destination.id}};
    receipt=await this.verifier.authorize(c,claim,record!,{globalPaused:Number(budget!.globally_paused)!==0,siteActive:site!.status==='active',websiteVerified:Boolean(site!.verified_at),automationEnabled:Number(site!.automation_enabled)===1,publishingEnabled:Number(site!.auto_publish_enabled)===1,contentPublishingEnabled:Number(p.enabled)===1&&Number(p.auto_publish)===1},Date.parse(at));
    if(receipt.authorization.id!==a.id||receipt.authorization.reservationId!==authRow.reservation_id||receipt.authorization.destinationRevision!==job!.destination.revision||receipt.authorization.destinationTarget!==job!.destination.target||authRow.approval_event_id!==a.approvalDecisionId)fail('PUBLICATION_AUTHORIZATION_CHANGED');
    const candidates=await read(c,"SELECT id FROM growth_quota_reservations_v2 WHERE organization_id=? AND website_id=? AND content_id=? AND operation='publication' AND state='reserved' FOR UPDATE",s);
    fundingId=String(one(candidates,'PUBLICATION_FUNDING_NOT_UNIQUE').id);if(!valid(fundingId)||fundingId===a.reservationId)fail('PUBLICATION_FUNDING_IDENTITY_DENIED');
    return {organizationId:scope.organizationId,websiteId:scope.websiteId,contentId:scope.contentId,contentVersion:job!.contentVersion,channel:job!.channel,destinationId:job!.destination.id,destinationRevision:job!.destination.revision,destinationTarget:job!.destination.target,authorizationId:a.id,approvalEventId:a.approvalDecisionId,connectorEvidenceHash:receipt.connectorHash,policyRevision,generationReservationId:a.reservationId,publicationFundingId:fundingId,expiresAt:new Date(receipt.expiresAt).toISOString()};
   },
   checkPublicationFunding:async(input,a,at)=>{
    if(!job||!record||!receipt||!authRow||input.id!==job.id||a.publicationFundingId!==fundingId||a.generationReservationId===fundingId)fail('PUBLICATION_FUNDING_IDENTITY_DENIED');
    funding=one(await read(c,'SELECT id,content_id,operation,state,version,reserved_units,charged_units,charged_minor,refunded_minor,expires_at,started_at FROM growth_quota_reservations_v2 WHERE organization_id=? AND website_id=? AND id=? FOR UPDATE',[scope.organizationId,scope.websiteId,fundingId]),'PUBLICATION_FUNDING_UNAVAILABLE');
    if(funding.id!==fundingId||funding.content_id!==scope.contentId||funding.operation!=='publication'||funding.state!=='reserved'||Number(funding.version)!==0||Number(funding.charged_units)!==0||Number(funding.charged_minor)!==0||Number(funding.refunded_minor)!==0||funding.started_at!==null||Date.parse(iso(funding.expires_at))<=Date.parse(at))fail('PUBLICATION_FUNDING_UNAVAILABLE');
    await this.authority.verifyBudget(c,scope,record!,fundingId,at);
   },
   insertClaim:async claim=>{
    context();if(claim.organizationId!==scope.organizationId||claim.websiteId!==scope.websiteId||claim.contentId!==scope.contentId||claim.channel!==job!.channel||claim.reservationId!==receipt!.authorization.reservationId)fail('PUBLICATION_CLAIM_SCOPE_DENIED');
    claimHash=publicationClaimHash(claim);
    await write(c,"INSERT INTO growth_publication_claims (organization_id,website_id,content_id,channel,claim_hash,reservation_id,status) VALUES (?,?,?,?,?,?,'unknown')",[...s,claim.channel,claimHash,claim.reservationId],'PUBLICATION_CLAIM_INSERT_FAILED');
   },
   startFunding:async(a,claim,at)=>{
    context();if(!claimHash||a.publicationFundingId!==fundingId||claim.reservationId!==a.generationReservationId)fail('PUBLICATION_FUNDING_IDENTITY_DENIED');
    const v=Number(funding!.version);if(!Number.isSafeInteger(v))fail('PUBLICATION_FUNDING_VERSION_DENIED');
    await write(c,"UPDATE growth_quota_reservations_v2 SET version=?,state='executing',charged_units=reserved_units,started_at=? WHERE organization_id=? AND website_id=? AND id=? AND version=? AND state='reserved' AND content_id=? AND operation='publication'",[v+1,new Date(at),scope.organizationId,scope.websiteId,fundingId,v,scope.contentId],'PUBLICATION_FUNDING_START_FAILED');
    const event={kind:'start',fundingId,claimHash,contentId:scope.contentId,at},json=JSON.stringify(event);
    await write(c,'INSERT INTO growth_quota_events_v2 (organization_id,website_id,reservation_id,request_key,expected_version,resulting_version,operation,occurred_at,actor_kind,actor_id,service_id,authorization_revision,policy_revision,authorized_at,authorization_expires_at,payload_hash,event_json) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
      [scope.organizationId,scope.websiteId,fundingId,'start_'+hash(fundingId+':'+claimHash),v,v+1,'start',new Date(at),'user',receipt!.requestorId,null,a.authorizationId,policyRevision,new Date(at),new Date(Math.min(Date.parse(a.expiresAt),Date.parse(at)+300000)),hash(json),json],'PUBLICATION_FUNDING_AUDIT_FAILED');
   },
   consumeAuthorization:async(a,claim,at)=>{context();if(a.authorizationId!==receipt!.authorization.id||publicationClaimHash(claim)!==claimHash)fail('PUBLICATION_AUTHORIZATION_CHANGED');await this.verifier.consume(c,receipt!,claimHash,Date.parse(at));},
   insertFundingBinding:async(input,a,claim,at)=>{
    context();if(input.id!==job!.id||a.publicationFundingId!==fundingId||publicationClaimHash(claim)!==claimHash)fail('PUBLICATION_BINDING_DENIED');
    await write(c,'INSERT INTO growth_publication_funding_bindings (organization_id,website_id,content_id,channel,authorization_id,claim_hash,generation_reservation_id,publication_reservation_id,publication_operation,content_version,destination_id,content_hash,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
      [...s,job!.channel,a.authorizationId,claimHash,a.generationReservationId,fundingId,'publication',job!.contentVersion,job!.destination.id,job!.contentHash,new Date(at)],'PUBLICATION_BINDING_FAILED');
   },
   contentUnknown:async(current,claim,at)=>{
    context();if(current.id!==record!.id||current.version!==record!.version||publicationClaimHash(claim)!==claimHash)fail('PUBLICATION_CONTENT_CHANGED');
    const event={kind:'publication_unknown' as const,eventId:'claim_'+claimHash,at},actor={userId:receipt!.requestorId,organizationId:scope.organizationId,websiteId:scope.websiteId,role:'admin' as const};
    const next=transitionContent(record!,event,actor);await writeContentTransition(c,record!,next,{event,actor});
   },
   appendAudit:async(input,a,claim)=>{
    context();if(input.id!==job!.id||a.authorizationId!==receipt!.authorization.id||publicationClaimHash(claim)!==claimHash)fail('PUBLICATION_AUDIT_SCOPE_DENIED');
    one(await read(c,'SELECT authorization_id FROM growth_publication_authorization_uses WHERE organization_id=? AND website_id=? AND authorization_id=? AND claim_hash=? FOR UPDATE',[scope.organizationId,scope.websiteId,a.authorizationId,claimHash]),'PUBLICATION_AUTHORIZATION_AUDIT_MISSING');
   },
   saveUnknownJob:async(input,claim,at)=>{
    context();if(input.id!==job!.id||job!.version!==0||job!.state!=='scheduled'||publicationClaimHash(claim)!==claimHash)fail('PUBLICATION_JOB_CHANGED');
    await fence.assertCurrent();const witness=await this.authority.independentWitness(fence);
    if(!Number.isSafeInteger(witness?.generation)||witness.generation<1||!valid(witness.leaseId))fail('PUBLICATION_INDEPENDENT_WITNESS_REQUIRED');
    const event={eventId:'claim_'+claimHash,payloadHash:hash(JSON.stringify([s,jobId,claimHash,fundingId,at])),operation:'claim',at};
    const next:PublicationJob={...job!,version:1,state:'awaiting_status',claim,nextProbeAt:at,journal:[event]};
    await write(c,"UPDATE growth_publication_jobs SET version=1,state='awaiting_status',authorization_id=?,claim_hash=?,publication_reservation_id=?,probe_attempts=0,next_probe_at=?,witness_generation=?,witness_lease_id=?,job_json=? WHERE organization_id=? AND website_id=? AND id=? AND version=0 AND state='scheduled' AND claim_hash IS NULL",[receipt!.authorization.id,claimHash,fundingId,new Date(at),witness.generation,witness.leaseId,JSON.stringify(next),...j],'PUBLICATION_JOB_CAS_FAILED');
    await write(c,'INSERT INTO growth_publication_job_events (organization_id,website_id,job_id,event_id,resulting_version,operation,occurred_at,payload_hash,event_json) VALUES (?,?,?,?,?,?,?,?,?)',
      [scope.organizationId,scope.websiteId,jobId,event.eventId,1,'claim',new Date(at),event.payloadHash,JSON.stringify(event)],'PUBLICATION_JOB_AUDIT_FAILED');
   },
   checkCommitBoundary:async(input,a,at)=>{
    context();if(input.id!==job!.id||a.authorizationId!==receipt!.authorization.id||!sessionHash||Date.parse(at)>=receipt!.expiresAt)fail('PUBLICATION_AUTHORIZATION_EXPIRED');
    const member=one(await read(c,'SELECT s.user_id,s.expires_at,s.revoked_at,u.disabled,m.role FROM growth_sessions s JOIN growth_users u ON u.id=s.user_id JOIN growth_memberships m ON m.user_id=s.user_id WHERE s.token_hash=? AND m.organization_id=? FOR UPDATE',[sessionHash,scope.organizationId]),'PUBLICATION_SESSION_REVOKED');
    const approver=one(await read(c,'SELECT m.role,u.disabled FROM growth_memberships m JOIN growth_users u ON u.id=m.user_id WHERE m.organization_id=? AND m.user_id=? FOR UPDATE',[scope.organizationId,receipt!.authorization.approverId]),'PUBLICATION_APPROVER_REVOKED');
    if(member.revoked_at!==null||Number(member.disabled)!==0||!['owner','admin'].includes(String(member.role))||member.user_id!==receipt!.requestorId||Date.parse(iso(member.expires_at))<=Date.parse(at)||Number(approver.disabled)!==0||!['owner','admin'].includes(String(approver.role)))fail('PUBLICATION_SESSION_OR_APPROVER_REVOKED');
    await receipt!.recheck(Date.parse(at));await this.authority.recheckBudget(c,scope,record!,fundingId,at);await fence.assertCurrent();
   }
  };
 }
}
