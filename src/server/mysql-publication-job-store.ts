/** One-connection PublicationJobStore claim bridge. No provider, worker, default pool or authority. */
import type {Pool,PoolConnection,RowDataPacket} from 'mysql2/promise';
import type {FactoryScope,FactoryContext} from '../core/content-factory';
import type {ContentRecord} from '../core/content-lifecycle';
import {contentAuthorizationHash} from '../core/publication-authorization';
import {parseStoredPublicationJob,type PublicationJob,type PublicationJobStore,type PublicationJobTransaction,type PublicationJobPrincipal} from '../core/safe-publication-jobs';
import type {IndependentPublicationFencer} from '../core/publication-atomic-integration';
import type {PublicationClaim} from '../core/publication-handoff';
import {decodeStoredContent} from './mysql-content-store';
import {decodeFactoryEnvelope} from './mysql-content-factory-store';
import {publicationClaimHash} from './publication-evidence';
import type {CertifiedAtomicParticipants} from './mysql-atomic-publication-transaction';
import {MySQLPublicationStatusOperations} from './mysql-publication-status-operations';
type Row=RowDataPacket&Record<string,unknown>;
const id=(x:unknown):x is string=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(x);
const fail=(code:string):never=>{throw Error(code);};
export interface PublicationJobStoreAuthorities {
 readonly capability:'publication-job-store-authorities-v1';
 /** Independent exact 010–014 metadata and ledger check; no installer or implicit migration. */
 assertPinned014(c:PoolConnection):Promise<void>;
 /** Current server session, organization/website membership and policy, from this connection. */
 authenticate(c:PoolConnection,context:FactoryContext,scope:FactoryScope,at:string):Promise<PublicationJobPrincipal>;
 /** Re-read session, issuer/key revocation, policy, destination and budget before COMMIT. */
 recheck(c:PoolConnection,context:FactoryContext,scope:FactoryScope,job:PublicationJob,at:string):Promise<void>;
}
export class MySQLPublicationJobStore implements PublicationJobStore {
 readonly capability='publication-workflow' as const;
 constructor(private readonly pool:Pick<Pool,'getConnection'>,private readonly fencer:IndependentPublicationFencer,private readonly participants:CertifiedAtomicParticipants,private readonly authority:PublicationJobStoreAuthorities,private readonly clock:()=>number=Date.now,private readonly status?:MySQLPublicationStatusOperations){
  if(typeof pool?.getConnection!=='function'||typeof fencer?.acquire!=='function'||participants?.capability!=='certified-010-013-atomic-participants'||typeof participants.open!=='function'||typeof participants.assertCompatible!=='function'||typeof participants.readCommittedIdentity!=='function'||authority?.capability!=='publication-job-store-authorities-v1'||typeof authority.assertPinned014!=='function'||typeof authority.authenticate!=='function'||typeof authority.recheck!=='function')fail('PUBLICATION_JOB_STORE_AUTHORITIES_REQUIRED');
 }
 async transaction<T>(scope:FactoryScope,jobId:string,work:(tx:PublicationJobTransaction)=>Promise<T>):Promise<T>{
  if(![scope.organizationId,scope.websiteId,scope.contentId,jobId].every(id)||typeof work!=='function')fail('PUBLICATION_JOB_STORE_SCOPE_DENIED');
  const fence=await this.fencer.acquire(scope,jobId);if(!fence?.assertCurrent||!fence?.release)fail('PUBLICATION_INDEPENDENT_FENCE_REQUIRED');
  let c:PoolConnection|undefined,begun=false,attempted=false,indeterminate=false,operationCompleted=false,committed=false,failure:unknown;
  let context:FactoryContext|undefined,principal:PublicationJobPrincipal|undefined;
  const s:[string,string,string]=[scope.organizationId,scope.websiteId,scope.contentId];
  try{
   await fence.assertCurrent();c=await this.pool.getConnection();
   await this.participants.assertCompatible(c);await this.authority.assertPinned014(c);
   await c.beginTransaction();begun=true;
   const readJob=async()=>{const [rows]=await c!.execute<Row[]>('SELECT version,state,job_json FROM growth_publication_jobs WHERE organization_id=? AND website_id=? AND id=?',[scope.organizationId,scope.websiteId,jobId]);if(rows.length!==1)return null;const r=rows[0],j=parseStoredPublicationJob(typeof r.job_json==='string'?JSON.parse(r.job_json):r.job_json);if(j.organizationId!==scope.organizationId||j.websiteId!==scope.websiteId||j.contentId!==scope.contentId||j.id!==jobId||j.version!==Number(r.version)||j.state!==r.state)fail('PUBLICATION_JOB_ROW_MISMATCH');return j;};
   const tx:PublicationJobTransaction={
    authenticate:async(ctx,requested,at)=>{if(context||ctx.organizationId!==scope.organizationId||JSON.stringify(requested)!==JSON.stringify(scope)||!/^[a-f0-9]{64}$/.test(ctx.sessionHash))fail('PUBLICATION_JOB_SESSION_DENIED');const checkedContext={...ctx};context=checkedContext;const checkedPrincipal=await this.authority.authenticate(c!,checkedContext,scope,at);const instant=Date.parse(at),checked=Date.parse(checkedPrincipal.checkedAt),expires=Date.parse(checkedPrincipal.expiresAt);if(checkedPrincipal.organizationId!==scope.organizationId||checkedPrincipal.websiteId!==scope.websiteId||!id(checkedPrincipal.userId)||!['owner','admin'].includes(checkedPrincipal.role)||![instant,checked,expires].every(Number.isFinite)||checked>instant||expires<=instant||expires>instant+300000)fail('PUBLICATION_JOB_MEMBERSHIP_DENIED');principal=checkedPrincipal;return checkedPrincipal;},
    load:async requested=>{if(!principal||requested!==jobId)fail('PUBLICATION_JOB_NOT_AUTHENTICATED');return readJob();},
    loadContent:async requested=>{if(!principal||JSON.stringify(requested)!==JSON.stringify(scope))fail('PUBLICATION_CONTENT_SCOPE_DENIED');const [rows]=await c!.execute<Row[]>('SELECT version,record_json FROM growth_content_records WHERE organization_id=? AND website_id=? AND id=?',s);if(rows.length!==1)fail('PUBLICATION_CONTENT_UNAVAILABLE');const stored=decodeStoredContent(rows[0] as Row&{record_json:string;version:number},...s);return Object.hasOwn(stored,'_factory')?decodeFactoryEnvelope(rows[0],scope).record:stored;},
    claimContentAndFunding:async()=>fail('PUBLICATION_ATOMIC_HOOK_REQUIRED'),
    claimAtomically:async(job,ctx,at,eventId)=>{
     const checkedContext=context;if(operationCompleted||!principal||!checkedContext||ctx.sessionHash!==checkedContext?.sessionHash||ctx.organizationId!==scope.organizationId||job.id!==jobId||job.version!==0||job.state!=='scheduled'||job.claim!==null)throw Error('PUBLICATION_ATOMIC_INTENT_DENIED');
     const a=this.participants.open(c!,scope,jobId,fence);if(!a)fail('ATOMIC_PARTICIPANTS_UNAVAILABLE');
     // Exactly the reviewed order; every method uses c, and no participant owns a pool/COMMIT.
     await a.lockScope(job);const record=await a.loadContent(job);
     if(record.id!==scope.contentId||record.organizationId!==scope.organizationId||record.websiteId!==scope.websiteId||record.stage!=='scheduled'||record.version!==job.contentVersion||record.schedule?.channel!==job.channel||contentAuthorizationHash(record)!==job.contentHash)fail('PUBLICATION_CONTENT_CHANGED');
     const auth=await a.authorize(job,checkedContext,at);
     if(auth.organizationId!==scope.organizationId||auth.websiteId!==scope.websiteId||auth.contentId!==scope.contentId||auth.contentVersion!==job.contentVersion||auth.channel!==job.channel||auth.destinationId!==job.destination.id||auth.destinationRevision!==job.destination.revision||auth.destinationTarget!==job.destination.target||!auth.generationReservationId||auth.generationReservationId===auth.publicationFundingId||!id(auth.publicationFundingId)||!/^[a-f0-9]{64}$/.test(auth.connectorEvidenceHash)||Date.parse(auth.expiresAt)<=Date.parse(at)||Date.parse(auth.expiresAt)>Date.parse(at)+300000)fail('PUBLICATION_AUTHORIZATION_CHANGED');
     await a.checkPublicationFunding(job,auth,at);
     const claim:PublicationClaim={organizationId:scope.organizationId,websiteId:scope.websiteId,contentId:scope.contentId,channel:job.channel,idempotencyKey:`publish:${scope.organizationId}:${scope.websiteId}:${scope.contentId}:${job.channel}`,reservationId:auth.generationReservationId};
     if(eventId!=='claim_'+publicationClaimHash(claim))fail('PUBLICATION_ATOMIC_EVENT_ID_DENIED');
     await a.insertClaim(claim);await a.startFunding(auth,claim,at);await a.consumeAuthorization(auth,claim,at);await a.insertFundingBinding(job,auth,claim,at);await a.contentUnknown(record,claim,at);await a.appendAudit(job,auth,claim,at);await a.saveUnknownJob(job,claim,at);
     await a.checkCommitBoundary(job,auth,new Date(this.clock()).toISOString());await fence.assertCurrent();
     const persisted=await readJob();if(!persisted||persisted.state!=='awaiting_status'||persisted.claim?.reservationId!==claim.reservationId||persisted.journal.at(-1)?.eventId!==eventId)throw Error('PUBLICATION_ATOMIC_JOB_NOT_PERSISTED');
     operationCompleted=true;return persisted;
    },
    statusAtomically:async(job,kind,eventId,at,evidence)=>{
     const status=this.status;if(operationCompleted||!principal||!context||job.id!==jobId||job.organizationId!==scope.organizationId||job.websiteId!==scope.websiteId||job.contentId!==scope.contentId||job.state!=='awaiting_status'||!status)throw Error('STATUS_TRANSACTION_ADAPTER_REQUIRED');
     if(kind==='probe_failed')await status.probeFailed(c!,scope,jobId,job.version,eventId,at);
     else if(kind==='reconcile'&&evidence)await status.reconcile(c!,scope,jobId,job.version,eventId,evidence,at);
     else fail('STATUS_EVIDENCE_REQUIRED');
     await fence.assertCurrent();const persisted=await readJob();if(!persisted)throw Error('PUBLICATION_STATUS_NOT_PERSISTED');
     operationCompleted=true;return persisted;
    },
    reconcileContentAndClaim:async()=>fail('STATUS_TRANSACTION_ADAPTER_REQUIRED'),cancelUnclaimed:async()=>fail('REVISION_TRANSACTION_ADAPTER_REQUIRED'),
    recheck:async(p,job,at)=>{const checkedContext=context;if(!principal||!checkedContext||p.userId!==principal.userId||p.role!==principal.role||job.id!==jobId||!operationCompleted)throw Error('PUBLICATION_JOB_RECHECK_DENIED');await this.authority.recheck(c!,checkedContext,scope,job,at);await fence.assertCurrent();},
    save:async()=>fail('SECOND_JOB_SAVE_DENIED')
   };
   const result=await work(tx);if(!operationCompleted||!context||!principal)throw Error('PUBLICATION_JOB_TRANSACTION_INCOMPLETE');
   const current=await readJob();if(!current)throw Error('PUBLICATION_ATOMIC_JOB_NOT_PERSISTED');
   await this.authority.recheck(c,context,scope,current,new Date(this.clock()).toISOString());await fence.assertCurrent();
   attempted=true;try{await c.commit();committed=true;}catch(error){indeterminate=true;throw Object.assign(Error('PUBLICATION_COMMIT_INDETERMINATE',{cause:error}),{code:'PUBLICATION_COMMIT_INDETERMINATE'});}
   return result;
  }catch(error){
   if(begun&&!attempted)try{await c!.rollback();}catch{error=Error('PUBLICATION_ROLLBACK_UNCERTAIN',{cause:error});}
   if(indeterminate){
    // A readback may need another pooled connection. Release the uncertain connection first.
    let released=true;try{c?.release();}catch{released=false;}c=undefined;
    let state:'committed'|'absent'|'indeterminate'='indeterminate';
    if(released){let timer:ReturnType<typeof setTimeout>|undefined;try{const observed=await Promise.race([
     this.participants.readCommittedIdentity(scope,jobId),
     new Promise<'indeterminate'>(resolve=>{timer=setTimeout(()=>resolve('indeterminate'),5000);})
    ]);if(['committed','absent','indeterminate'].includes(observed))state=observed;}catch{}finally{if(timer)clearTimeout(timer);}}
    error=Error('PUBLICATION_COMMIT_INDETERMINATE_'+state.toUpperCase()+'_OPERATOR_HOLD',{cause:error});
   }
   failure=error;
   throw error;
  }finally{
   let cleanup:unknown;try{c?.release();}catch(error){cleanup=error;}
   try{await fence.release();}catch(error){cleanup??=error;}
   if(cleanup&&!failure)throw Error(committed?'PUBLICATION_POST_COMMIT_CLEANUP_OPERATOR_HOLD':'PUBLICATION_CLEANUP_UNCERTAIN',{cause:cleanup});
  }
 }
}
