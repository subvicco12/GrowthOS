/** Contract for a future independently certified adapter. No SQL pool, provider or worker exists here. */
import type {FactoryContext,FactoryScope} from './content-factory';
import {parseStoredPublicationJob,type PublicationJob} from './safe-publication-jobs';
import type {PublicationClaim} from './publication-handoff';
import {contentAuthorizationHash} from './publication-authorization';
import type {ContentRecord} from './content-lifecycle';

export interface IndependentPublicationFence {
  assertCurrent():Promise<void>;
  release():Promise<void>;
}
export interface IndependentPublicationFencer {
  acquire(scope:FactoryScope,jobId:string):Promise<IndependentPublicationFence>;
}
export interface AtomicPublicationAuthorization {
  organizationId:string;websiteId:string;contentId:string;contentVersion:number;channel:string;
  destinationId:string;destinationRevision:string;destinationTarget:string;
  authorizationId:string;approvalEventId:string;connectorEvidenceHash:string;policyRevision:string;
  generationReservationId:string;publicationFundingId:string;expiresAt:string;
}
export interface AtomicPublicationTransaction {
  /** Locks portfolio budget, website, policy, content, authorization and funding in reviewed order. */
  lockScope(job:PublicationJob):Promise<void>;
  loadContent(job:PublicationJob):Promise<ContentRecord>;
  /** Fresh server session, approver, switches, trust registry + independent checkpoint, destination. */
  authorize(job:PublicationJob,context:FactoryContext,at:string):Promise<AtomicPublicationAuthorization>;
  /** Verifies publication operation, site-local week, monthly budget, currency, ceiling, expiry and unique funding request. */
  checkPublicationFunding(job:PublicationJob,authorization:AtomicPublicationAuthorization,at:string):Promise<void>;
  /** One-time claim insert, quota-v2 start, authorization use, content unknown event and audit all use this transaction. */
  insertClaim(claim:PublicationClaim):Promise<void>;
  startFunding(authorization:AtomicPublicationAuthorization,claim:PublicationClaim,at:string):Promise<void>;
  consumeAuthorization(authorization:AtomicPublicationAuthorization,claim:PublicationClaim,at:string):Promise<void>;
  /** Immutable scoped bridge: claim/auth legacy generation ID and distinct v2 publication ID. */
  insertFundingBinding(job:PublicationJob,authorization:AtomicPublicationAuthorization,claim:PublicationClaim,at:string):Promise<void>;
  contentUnknown(record:ContentRecord,claim:PublicationClaim,at:string):Promise<void>;
  appendAudit(job:PublicationJob,authorization:AtomicPublicationAuthorization,claim:PublicationClaim,at:string):Promise<void>;
  saveUnknownJob(job:PublicationJob,claim:PublicationClaim,at:string):Promise<void>;
  /** Re-read real session/policy/connector/funding and check independent fence immediately before commit. */
  checkCommitBoundary(job:PublicationJob,authorization:AtomicPublicationAuthorization,at:string):Promise<void>;
}
export interface AtomicPublicationRepository {
  capability:'single-transaction-publication';
  /** Must own a single MariaDB connection, rollback ALL writes on failure and assert fence at the actual COMMIT boundary. */
  transaction<T>(scope:FactoryScope,jobId:string,fence:IndependentPublicationFence,work:(tx:AtomicPublicationTransaction)=>Promise<T>):Promise<T>;
  /** Read-only exact identity recovery after an indeterminate commit. It never issues another claim. */
  readCommittedIdentity(scope:FactoryScope,jobId:string):Promise<'committed'|'absent'|'indeterminate'>;
}
const requireState=(ok:unknown,code:string):void=>{if(!ok)throw Error(code);};
export class PublicationAtomicCoordinator {
  constructor(private readonly fencer:IndependentPublicationFencer,private readonly repository:AtomicPublicationRepository,private readonly clock:()=>number=Date.now){
    requireState(typeof fencer?.acquire==='function'&&repository?.capability==='single-transaction-publication'&&typeof repository?.transaction==='function'&&typeof repository?.readCommittedIdentity==='function','ATOMIC_PUBLICATION_DEPENDENCIES_REQUIRED');
  }
  async claim(job:PublicationJob,context:FactoryContext):Promise<PublicationClaim>{
    const frozen=parseStoredPublicationJob(structuredClone(job)),ctx=structuredClone(context);
    const scope={organizationId:frozen.organizationId,websiteId:frozen.websiteId,contentId:frozen.contentId};
    requireState(ctx.organizationId===scope.organizationId&&/^[a-f0-9]{64}$/.test(ctx.sessionHash)&&frozen.state==='scheduled'&&frozen.claim===null&&Number.isSafeInteger(frozen.version)&&frozen.version>=0&&
      Number.isSafeInteger(frozen.contentVersion)&&frozen.contentVersion>=0&&Date.parse(frozen.notBefore)<=this.clock(),'PUBLICATION_INTENT_DENIED');
    const fence=await this.fencer.acquire(scope,frozen.id);
    let indeterminate=false;
    try{
      await fence.assertCurrent();
      const result=await this.repository.transaction(scope,frozen.id,fence,async tx=>{
        const now=new Date(this.clock()).toISOString();
        await tx.lockScope(frozen);
        const record=await tx.loadContent(frozen);
        requireState(record.id===scope.contentId&&record.organizationId===scope.organizationId&&record.websiteId===scope.websiteId&&record.stage==='scheduled'&&record.version===frozen.contentVersion&&record.schedule?.channel===frozen.channel&&contentAuthorizationHash(record)===frozen.contentHash,'PUBLICATION_CONTENT_CHANGED');
        const a=await tx.authorize(frozen,ctx,now);
        requireState(a.organizationId===scope.organizationId&&a.websiteId===scope.websiteId&&a.contentId===scope.contentId&&a.contentVersion===frozen.contentVersion&&a.channel===frozen.channel&&
          a.destinationId===frozen.destination.id&&a.destinationRevision===frozen.destination.revision&&a.destinationTarget===frozen.destination.target&&
          /^[a-f0-9]{64}$/.test(a.connectorEvidenceHash)&&[a.authorizationId,a.approvalEventId,a.policyRevision,a.generationReservationId,a.publicationFundingId].every(v=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(v))&&
          a.generationReservationId.length<=36&&a.generationReservationId!==a.publicationFundingId&&
          Date.parse(a.expiresAt)>Date.parse(now)&&Date.parse(a.expiresAt)<=Date.parse(now)+300000,'PUBLICATION_AUTHORIZATION_CHANGED');
        await tx.checkPublicationFunding(frozen,a,now);
        const claim:PublicationClaim={organizationId:scope.organizationId,websiteId:scope.websiteId,contentId:scope.contentId,channel:frozen.channel,
          idempotencyKey:`publish:${scope.organizationId}:${scope.websiteId}:${scope.contentId}:${frozen.channel}`,reservationId:a.generationReservationId};
        await tx.insertClaim(claim);
        await tx.startFunding(a,claim,now);
        await tx.consumeAuthorization(a,claim,now);
        await tx.insertFundingBinding(frozen,a,claim,now);
        await tx.contentUnknown(record,claim,now);
        await tx.appendAudit(frozen,a,claim,now);
        await tx.saveUnknownJob(frozen,claim,now);
        await tx.checkCommitBoundary(frozen,a,new Date(this.clock()).toISOString());
        await fence.assertCurrent();
        return claim;
      });
      return result;
    }catch(error){
      if((error as {code?:string}).code==='PUBLICATION_COMMIT_INDETERMINATE'){
        indeterminate=true;
        const state=await this.repository.readCommittedIdentity(scope,frozen.id).catch(()=>'indeterminate' as const);
        throw Error('PUBLICATION_COMMIT_INDETERMINATE_'+state.toUpperCase()+'_OPERATOR_HOLD');
      }
      throw error;
    }finally{
      await fence.release().catch(()=>{if(!indeterminate)throw Error('PUBLICATION_FENCE_RELEASE_UNCERTAIN');});
    }
  }
}
