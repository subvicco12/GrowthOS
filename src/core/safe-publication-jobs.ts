/** Durable adapter protocol only. This module has NO dispatch, worker loop, timer or provider client. */
import {z} from 'zod';
import {createHash} from 'node:crypto';
import {factoryHash,type FactoryContext,type FactoryScope} from './content-factory';
import type {ContentRecord} from './content-lifecycle';
import type {PublicationClaim} from './publication-handoff';
import {contentAuthorizationHash} from './publication-authorization';
import type {SignedPublicationObservation} from '../server/publication-evidence';
const id=z.string().regex(/^[A-Za-z0-9_-]{1,128}$/),hash=z.string().regex(/^[a-f0-9]{64}$/),time=z.string().datetime();
const destinationSchema=z.object({id,revision:id,target:z.string().max(2048).refine(s=>{try{const u=new URL(s);return u.protocol==='https:'&&!u.username&&!u.password&&!u.search&&!u.hash&&u.href===s;}catch{return false;}})}).strict();
export type JobDestination=z.infer<typeof destinationSchema>;
export interface PublicationJob extends FactoryScope {
 schemaVersion:1;id:string;version:number;contentVersion:number;contentHash:string;channel:string;destination:JobDestination;
 state:'scheduled'|'awaiting_status'|'confirmed'|'absent'|'cancelled'|'operator_review';notBefore:string;
 claim:PublicationClaim|null;probeAttempts:number;nextProbeAt:string|null;
 journal:readonly {eventId:string;payloadHash:string;operation:string;at:string}[];
}
export interface BoundProviderObservation {
 format:'growthos-synthetic-provider-observation-v1';synthetic:true;
 destination:JobDestination;observation:SignedPublicationObservation;bindingSignature:string;
}
export interface PublicationJobPrincipal {userId:string;organizationId:string;websiteId:string;role:string;checkedAt:string;expiresAt:string}
export interface PublicationJobTransaction {
 authenticate(context:FactoryContext,scope:FactoryScope,at:string):Promise<PublicationJobPrincipal>;
 load(id:string):Promise<PublicationJob|null>;
 loadContent(scope:FactoryScope):Promise<ContentRecord>;
 /** MUST atomically: fresh auth + approval consume + independent connector/fence + quota-v2 funded start,
  * unique claim + content publication_unknown + audit. Missing any dependency denies. Never dispatch. */
 claimContentAndFunding(job:PublicationJob,context:FactoryContext,at:string):Promise<PublicationClaim>;
 /** SQL adapter completes claim, funding, authorization, content, job and audit itself on this transaction.
  * Returns its persisted job; the workflow MUST NOT issue a second save. */
 claimAtomically?(job:PublicationJob,context:FactoryContext,at:string,eventId:string):Promise<PublicationJob>;
 /** Supplied-connection status participant persists its own CAS and immutable event. */
 statusAtomically?(job:PublicationJob,kind:'probe_failed'|'reconcile',eventId:string,at:string,evidence?:BoundProviderObservation):Promise<PublicationJob>;
 /** Must verify provider signature, trusted registry/current revocation and immutable authorization destination,
  * then update claim/content/observation journal within THIS transaction. Unknown never becomes absent. */
 reconcileContentAndClaim(job:PublicationJob,input:BoundProviderObservation,at:string):Promise<'confirmed'|'absent'|'unknown'>;
 /** Before a claim only: cancel content schedule + audited release of unstarted funding, atomically. */
 cancelUnclaimed(job:PublicationJob,at:string):Promise<void>;
 recheck(principal:PublicationJobPrincipal,job:PublicationJob,at:string):Promise<void>;
 save(expectedVersion:number,next:PublicationJob):Promise<void>;
}
export interface PublicationJobStore {
 capability:'publication-workflow';
 /** Independent non-escaping fenced lease BEFORE SQL locks, through commit; CAS/job/content/claim/funding/audit atomic.
  * This interface cannot be implemented by calling claimOnce() in a separate transaction. */
 transaction<T>(scope:FactoryScope,jobId:string,work:(tx:PublicationJobTransaction)=>Promise<T>):Promise<T>;
}
const publicClaimSchema=z.object({organizationId:id,websiteId:id,contentId:id,channel:id.max(80),idempotencyKey:z.string().min(1).max(512),reservationId:id}).strict();
const storedJobSchema=z.object({schemaVersion:z.literal(1),id,organizationId:id,websiteId:id,contentId:id,version:z.number().int().nonnegative().safe(),contentVersion:z.number().int().nonnegative().safe(),contentHash:hash,channel:id.max(80),destination:destinationSchema,state:z.enum(['scheduled','awaiting_status','confirmed','absent','cancelled','operator_review']),notBefore:time,claim:publicClaimSchema.nullable(),probeAttempts:z.number().int().min(0).max(5),nextProbeAt:time.nullable(),journal:z.array(z.object({eventId:id,payloadHash:hash,operation:z.enum(['claim','cancel','probe_failed','reconcile']),at:time}).strict())}).strict();
export const parseStoredPublicationJob=(input:unknown):PublicationJob=>storedJobSchema.parse(input);
export class UnavailablePublicationJobStore implements PublicationJobStore {
 readonly capability='publication-workflow' as const;
 async transaction<T>():Promise<T>{throw Error('ATOMIC_FUNDED_FENCED_JOB_ADAPTER_REQUIRED');}
}
const base={jobId:id,websiteId:id,contentId:id,expectedVersion:z.number().int().nonnegative().safe(),eventId:id};
const commandSchema=z.discriminatedUnion('kind',[
 z.object({...base,kind:z.literal('claim')}).strict(),z.object({...base,kind:z.literal('cancel')}).strict(),
 z.object({...base,kind:z.literal('probe_failed')}).strict(),
 z.object({...base,kind:z.literal('reconcile'),evidence:z.unknown()}).strict()
]);
export type PublicationJobCommand=z.infer<typeof commandSchema>;
const need=(v:unknown,c:string)=>{if(!v)throw Error(c);};
export function createPublicationJob(record:ContentRecord,input:{id:string;destination:JobDestination}):PublicationJob {
 id.parse(input.id);const destination=destinationSchema.parse(input.destination);
 need(record.stage==='scheduled'&&record.approval&&record.quality&&record.schedule,'APPROVED_SCHEDULE_REQUIRED');
 return {schemaVersion:1,id:input.id,organizationId:record.organizationId,websiteId:record.websiteId,contentId:record.id,version:0,contentVersion:record.version,contentHash:contentAuthorizationHash(record),channel:record.schedule!.channel,destination,state:'scheduled',notBefore:record.schedule!.at,claim:null,probeAttempts:0,nextProbeAt:null,journal:[]};
}
function principal(p:PublicationJobPrincipal,scope:FactoryScope,at:string){const now=Date.parse(at),checked=Date.parse(p.checkedAt),expires=Date.parse(p.expiresAt);need(p.organizationId===scope.organizationId&&p.websiteId===scope.websiteId&&id.safeParse(p.userId).success&&['owner','admin'].includes(p.role)&&Number.isFinite(now)&&checked<=now&&now<expires&&expires-checked<=300000,'JOB_SESSION_OR_ROLE_DENIED');}
function retry(job:PublicationJob,at:string):PublicationJob {const attempts=job.probeAttempts+1;return {...job,probeAttempts:attempts,state:attempts>=5?'operator_review':'awaiting_status',nextProbeAt:attempts>=5?null:new Date(Date.parse(at)+Math.min(300000,1000*2**(attempts-1))).toISOString()};}
function boundClaim(job:PublicationJob,claim:PublicationClaim){need(claim.organizationId===job.organizationId&&claim.websiteId===job.websiteId&&claim.contentId===job.contentId&&claim.channel===job.channel&&claim.idempotencyKey===`publish:${job.organizationId}:${job.websiteId}:${job.contentId}:${job.channel}`&&id.safeParse(claim.reservationId).success,'JOB_CLAIM_SCOPE_DENIED');}
async function completedStatus(result:PublicationJob,job:PublicationJob,p:PublicationJobPrincipal,scope:FactoryScope,eventId:string,tx:PublicationJobTransaction,clock:()=>number):Promise<PublicationJob>{
 const next=parseStoredPublicationJob(result);
 need(next.id===job.id&&next.organizationId===scope.organizationId&&next.websiteId===scope.websiteId&&next.contentId===scope.contentId&&next.version===job.version+1&&next.contentVersion===job.contentVersion&&next.contentHash===job.contentHash&&next.channel===job.channel&&factoryHash(next.destination)===factoryHash(job.destination)&&factoryHash(next.claim)===factoryHash(job.claim)&&next.probeAttempts===job.probeAttempts+1&&next.journal.length===job.journal.length+1&&next.journal.at(-1)?.eventId===eventId&&['awaiting_status','confirmed','absent','operator_review'].includes(next.state),'PUBLICATION_ATOMIC_STATUS_MISMATCH');
 const now=new Date(clock()).toISOString();principal(p,scope,now);await tx.recheck(p,next,now);return structuredClone(next);
}
export class SafePublicationWorkflow {
 constructor(private readonly store:PublicationJobStore=new UnavailablePublicationJobStore(),private readonly clock:()=>number=Date.now){need(store.capability==='publication-workflow','JOB_CAPABILITY_DENIED');}
 async execute(context:FactoryContext,input:unknown):Promise<PublicationJob>{
 const ctx=z.object({organizationId:id,sessionHash:hash}).strict().parse(context),c=structuredClone(commandSchema.parse(input)),scope={organizationId:ctx.organizationId,websiteId:c.websiteId,contentId:c.contentId};
 // Snapshot evidence BEFORE any asynchronous lease/transaction wait. Evidence is untrusted until adapter verification.
 const evidence=c.kind==='reconcile'?structuredClone(c.evidence):undefined;
 return this.store.transaction(scope,c.jobId,async tx=>{
 const at=new Date(this.clock()).toISOString(),p=structuredClone(await tx.authenticate(ctx,scope,at));principal(p,scope,at);
 const loaded=await tx.load(c.jobId);need(loaded,'PUBLICATION_JOB_NOT_FOUND');let job:PublicationJob=storedJobSchema.parse(loaded);
 need(job.schemaVersion===1&&job.id===c.jobId&&job.organizationId===scope.organizationId&&job.websiteId===scope.websiteId&&job.contentId===scope.contentId,'PUBLICATION_JOB_SCOPE_DENIED');destinationSchema.parse(job.destination);time.parse(job.notBefore);
 need(job.version===c.expectedVersion&&Number.isSafeInteger(job.version)&&job.version>=0&&job.version<Number.MAX_SAFE_INTEGER,'PUBLICATION_JOB_VERSION_CONFLICT');need(!job.journal.some(e=>e.eventId===c.eventId),'PUBLICATION_JOB_REPLAY');need(Number.isSafeInteger(job.probeAttempts)&&job.probeAttempts>=0&&job.probeAttempts<=5,'PUBLICATION_JOB_CORRUPT');
 need(!['confirmed','absent','cancelled','operator_review'].includes(job.state),'PUBLICATION_JOB_TERMINAL');
 switch(c.kind){
 case 'claim':{
 need(job.state==='scheduled'&&job.claim===null&&Date.parse(job.notBefore)<=Date.parse(at),'PUBLICATION_JOB_NOT_DUE_OR_CLAIMED');
 const record=await tx.loadContent(scope);need(record.organizationId===scope.organizationId&&record.websiteId===scope.websiteId&&record.id===scope.contentId&&record.stage==='scheduled'&&record.version===job.contentVersion&&contentAuthorizationHash(record)===job.contentHash&&record.schedule?.channel===job.channel,'PUBLICATION_JOB_STALE_CONTENT');
 if(tx.claimAtomically){
  const expected='claim_'+createHash('sha256').update(`publish:${job.organizationId}:${job.websiteId}:${job.contentId}:${job.channel}`).digest('hex');
  need(c.eventId===expected,'PUBLICATION_ATOMIC_EVENT_ID_DENIED');
  const persisted=parseStoredPublicationJob(await tx.claimAtomically(structuredClone(job),ctx,at,c.eventId));
  need(persisted.version===job.version+1&&persisted.state==='awaiting_status'&&persisted.claim!==null&&persisted.organizationId===scope.organizationId&&persisted.websiteId===scope.websiteId&&persisted.contentId===scope.contentId&&persisted.id===job.id&&persisted.contentVersion===job.contentVersion&&persisted.contentHash===job.contentHash&&factoryHash(persisted.destination)===factoryHash(job.destination)&&persisted.journal.length===job.journal.length+1&&persisted.journal.at(-1)?.eventId===c.eventId,'PUBLICATION_ATOMIC_JOB_MISMATCH');
  boundClaim(job,persisted.claim!);
  const now=new Date(this.clock()).toISOString();principal(p,scope,now);await tx.recheck(p,persisted,now);
  return structuredClone(persisted);
 }
 const claim=await tx.claimContentAndFunding(structuredClone(job),ctx,at);boundClaim(job,claim);const safe=publicClaimSchema.parse({organizationId:claim.organizationId,websiteId:claim.websiteId,contentId:claim.contentId,channel:claim.channel,idempotencyKey:claim.idempotencyKey,reservationId:claim.reservationId});job={...job,claim:safe,state:'awaiting_status',nextProbeAt:at};break;}
 case 'cancel':need(job.state==='scheduled'&&job.claim===null,'CLAIMED_CANCELLATION_REQUIRES_RECONCILIATION');await tx.cancelUnclaimed(structuredClone(job),at);job={...job,state:'cancelled',nextProbeAt:null};break;
 case 'probe_failed':need(job.state==='awaiting_status'&&job.claim&&job.nextProbeAt!==null&&Date.parse(job.nextProbeAt)<=Date.parse(at),'PROBE_NOT_DUE');boundClaim(job,job.claim!);if(tx.statusAtomically)return completedStatus(await tx.statusAtomically(job,'probe_failed',c.eventId,at),job,p,scope,c.eventId,tx,this.clock);job=retry(job,at);break;
 case 'reconcile':{
 need(job.state==='awaiting_status'&&job.claim&&job.nextProbeAt!==null&&Date.parse(job.nextProbeAt)<=Date.parse(at),'PROBE_NOT_DUE');boundClaim(job,job.claim!);
 need(evidence&&typeof evidence==='object'&&(evidence as BoundProviderObservation).format==='growthos-synthetic-provider-observation-v1'&&(evidence as BoundProviderObservation).synthetic===true,'SYNTHETIC_EVIDENCE_REQUIRED');
 const bound=evidence as BoundProviderObservation;need(factoryHash(destinationSchema.parse(bound.destination))===factoryHash(job.destination),'PROVIDER_DESTINATION_DENIED');
 if(tx.statusAtomically)return completedStatus(await tx.statusAtomically(job,'reconcile',c.eventId,at,bound),job,p,scope,c.eventId,tx,this.clock);
 const state=await tx.reconcileContentAndClaim(structuredClone(job),bound,at);need(['confirmed','absent','unknown'].includes(state),'PROVIDER_STATUS_INVALID');job=state==='unknown'?retry(job,at):{...job,state,nextProbeAt:null};break;}
 }
 const now=new Date(this.clock()).toISOString();principal(p,scope,now);await tx.recheck(p,job,now);
 const next={...job,version:job.version+1,journal:[...job.journal,{eventId:c.eventId,payloadHash:factoryHash(c),operation:c.kind,at}]};await tx.save(c.expectedVersion,structuredClone(next));return structuredClone(next);
 });}
}
