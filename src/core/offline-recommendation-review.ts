/** Review-only boundary. No publisher, worker, or production persistence implementation. */
export type ReviewDecision = 'accept_for_planning'|'reject'|'defer';
export type ReviewStatus = 'proposed'|'accepted_for_planning'|'rejected'|'deferred';
export type ReviewRecord = { id:string;organizationId:string;websiteId:string; evidenceHash:string;
  expiresAt:string; revision:number; status:ReviewStatus };
export type ReviewEvent = { organizationId:string;websiteId:string;recommendationId:string;actorId:string;
  decision:ReviewDecision;reason:string;evidenceHash:string;previousRevision:number;revision:number;idempotencyKey:string;at:string };
export interface ReviewTransaction {
  lock(organizationId:string,websiteId:string,id:string):Promise<ReviewRecord|null>;
  append(event:ReviewEvent):Promise<void>;
  compareAndSwap(previous:ReviewRecord,next:ReviewRecord):Promise<boolean>;
  findIdempotency(organizationId:string,key:string):Promise<ReviewEvent|null>;
}
export interface ReviewStore { transaction<T>(fn:(tx:ReviewTransaction)=>Promise<T>):Promise<T> }
export interface ReviewAuthority {
  assertCurrent(input:{organizationId:string;websiteId:string;actorId:string;role:'owner'|'admin';
    evidenceHash:string;recommendationId:string}):Promise<void>;
  assertCurrentBudgetAndSwitches(organizationId:string,websiteId:string):Promise<void>;
  currentTime():Promise<string>;
}
export type ReviewInput = {organizationId:string;websiteId:string;recommendationId:string;actorId:string;
  role:string;evidenceHash:string;expectedRevision:number;decision:ReviewDecision;reason:string;
  idempotencyKey:string};
export async function reviewRecommendation(input:ReviewInput,authority:ReviewAuthority,store:ReviewStore):Promise<ReviewEvent> {
  if(!['owner','admin'].includes(input.role)||!['accept_for_planning','reject','defer'].includes(input.decision)||
    !input.organizationId||!input.websiteId||!input.recommendationId||!input.actorId||
    !/^[0-9a-f]{64}$/.test(input.evidenceHash)||!Number.isSafeInteger(input.expectedRevision)||input.expectedRevision<0||
    !/^[a-z0-9_-]{8,100}$/i.test(input.idempotencyKey)||input.reason.trim().length<5||input.reason.length>500)
    throw Error('REVIEW_INPUT_DENIED');
  // Authority is rechecked inside the transaction and before the CAS/append boundary.
  return store.transaction(async tx=>{
    const current=await tx.lock(input.organizationId,input.websiteId,input.recommendationId);
    if(!current||current.organizationId!==input.organizationId||current.websiteId!==input.websiteId||current.id!==input.recommendationId)
      throw Error('REVIEW_SCOPE_DENIED');
    const now=await authority.currentTime();
    if(!Number.isFinite(Date.parse(now)))throw Error('REVIEW_CLOCK_UNAVAILABLE');
    if(current.evidenceHash!==input.evidenceHash||Date.parse(current.expiresAt)<=Date.parse(now))throw Error('REVIEW_EVIDENCE_STALE');
    await authority.assertCurrent({...input,role:input.role as 'owner'|'admin'});
    await authority.assertCurrentBudgetAndSwitches(input.organizationId,input.websiteId);
    const prior=await tx.findIdempotency(input.organizationId,input.idempotencyKey);
    if(prior) {
      if(prior.websiteId!==input.websiteId||prior.recommendationId!==input.recommendationId||prior.actorId!==input.actorId||
        prior.decision!==input.decision||prior.reason!==input.reason.trim()||prior.evidenceHash!==input.evidenceHash||
        prior.previousRevision!==input.expectedRevision)
        throw Error('REVIEW_REPLAY_CONFLICT');
      return prior;
    }
    if(current.revision!==input.expectedRevision||current.status!=='proposed')throw Error('REVIEW_STALE_OR_DECIDED');
    const next:ReviewRecord={...current,revision:current.revision+1,
      status:input.decision==='accept_for_planning'?'accepted_for_planning':input.decision==='reject'?'rejected':'deferred'};
    const event:ReviewEvent={organizationId:input.organizationId,websiteId:input.websiteId,recommendationId:input.recommendationId,
      actorId:input.actorId,decision:input.decision,reason:input.reason.trim(),evidenceHash:current.evidenceHash,previousRevision:current.revision,
      revision:next.revision,idempotencyKey:input.idempotencyKey,at:now};
    await tx.append(event);
    if(!await tx.compareAndSwap(current,next))throw Error('REVIEW_CONCURRENT_DECISION');
    return event;
  });
}
