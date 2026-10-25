import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateObservedPages } from '../evidence-growth-opportunities';
import { reviewRecommendation, type ReviewRecord, type ReviewEvent, type ReviewStore, type ReviewAuthority } from '../offline-recommendation-review';

const org='org-a',site='site-a',id='recommendation-a',hash='a'.repeat(64),at='2026-10-25T00:00:00Z';
const input={organizationId:org,websiteId:site,recommendationId:id,actorId:'actor-a',role:'admin',evidenceHash:hash,
 expectedRevision:0,decision:'accept_for_planning' as const,reason:'Review this improvement',idempotencyKey:'decision_key_1'};

test('SEO opportunities carry source provenance, deterministic IDs and no invented performance or revenue',()=>{
 const scope={organizationId:org,websiteId:site,host:'example.test'};
 const page={url:'https://example.test/pricing',observedAt:at,sourceHash:hash,status:200,indexable:true,title:null,
  description:null,h1Count:0,wordCount:120,internalLinks:1,mobileUsability:'fail' as const};
 const ideas=evaluateObservedPages(scope,[page],at);
 assert.ok(ideas.some(x=>x.category==='content'));
 assert.ok(ideas.some(x=>x.category==='usability'));
 assert.ok(ideas.every(x=>x.evidence.hash===hash&&x.confidence==='observed-limited'&&x.cost==='unknown'));
 assert.deepEqual(ideas,evaluateObservedPages(scope,[page],at));
 assert.equal(evaluateObservedPages(scope,[{...page,indexable:undefined,title:undefined,description:undefined,
  h1Count:undefined,wordCount:undefined,internalLinks:undefined,mobileUsability:'unknown'}],at).length,0);
 assert.throws(()=>evaluateObservedPages(scope,[{...page,url:'https://other.test/'}],at),/INTELLIGENCE_EVIDENCE_DENIED/);
 assert.throws(()=>evaluateObservedPages(scope,[{...page,wordCount:-1}],at),/INTELLIGENCE_EVIDENCE_DENIED/);
});

function syntheticStore(){
 let record:ReviewRecord={id,organizationId:org,websiteId:site,evidenceHash:hash,expiresAt:'2026-10-26T00:00:00Z',revision:0,status:'proposed'};
 let events:ReviewEvent[]=[];let release=Promise.resolve();
 const store:ReviewStore={transaction:async fn=>{
   const previous=release;let unlock!:()=>void;release=new Promise<void>(resolve=>{unlock=resolve;});await previous;
   let draft={...record};const pending:ReviewEvent[]=[];
   try {const value=await fn({lock:async()=>draft,findIdempotency:async(o,key)=>events.find(e=>e.organizationId===o&&e.idempotencyKey===key)??null,
    compareAndSwap:async(old,next)=>{if(draft.revision!==old.revision)return false;draft=next;return true;},
    append:async event=>{pending.push(event);}});
    record=draft;events=[...events,...pending];return value;
   } finally {unlock();}
 }};
 return {store,get events(){return events;},get record(){return record;},revoke(){record={...record,evidenceHash:'b'.repeat(64)};}};
}
test('two synthetic sessions serialize one decision; replay cannot double append',async()=>{
 const x=syntheticStore();const authority:ReviewAuthority={assertCurrent:async()=>{},assertCurrentBudgetAndSwitches:async()=>{},currentTime:async()=>at};
 const settled=await Promise.allSettled([reviewRecommendation(input,authority,x.store),reviewRecommendation({...input,idempotencyKey:'decision_key_2'},authority,x.store)]);
 assert.equal(settled.filter(x=>x.status==='fulfilled').length,1);assert.equal(x.events.length,1);
 assert.equal(x.record.status,'accepted_for_planning');
 const replay=await reviewRecommendation(input,authority,x.store);assert.equal(replay.revision,1);assert.equal(x.events.length,1);
 await assert.rejects(reviewRecommendation({...input,decision:'reject'},authority,x.store),/REVIEW_REPLAY_CONFLICT/);
 x.revoke();await assert.rejects(reviewRecommendation(input,authority,x.store),/REVIEW_EVIDENCE_STALE/);
 await assert.rejects(reviewRecommendation({...input,evidenceHash:'b'.repeat(64)},authority,x.store),/REVIEW_REPLAY_CONFLICT/);
});
test('role, scope, revoked authority, budget and expired evidence refuse before append',async()=>{
 const x=syntheticStore();let authority:ReviewAuthority={assertCurrent:async()=>{},assertCurrentBudgetAndSwitches:async()=>{},currentTime:async()=>at};
 await assert.rejects(reviewRecommendation({...input,role:'viewer'},authority,x.store),/REVIEW_INPUT_DENIED/);
 await assert.rejects(reviewRecommendation({...input,organizationId:'org-b'},authority,x.store),/REVIEW_SCOPE_DENIED/);
 authority={...authority,assertCurrent:async()=>{throw Error('MEMBERSHIP_REVOKED');}};
 await assert.rejects(reviewRecommendation(input,authority,x.store),/MEMBERSHIP_REVOKED/);
 authority={...authority,assertCurrent:async()=>{},assertCurrentBudgetAndSwitches:async()=>{throw Error('BUDGET_UNKNOWN');}};
 await assert.rejects(reviewRecommendation(input,authority,x.store),/BUDGET_UNKNOWN/);
 authority={...authority,assertCurrentBudgetAndSwitches:async()=>{},currentTime:async()=> '2026-10-27T00:00:00Z'};
 await assert.rejects(reviewRecommendation(input,authority,x.store),/REVIEW_EVIDENCE_STALE/);
 assert.equal(x.events.length,0);assert.equal(x.record.revision,0);
});
test('failed append rolls back when supplied transaction is atomic; unknown commit propagates to operator',async()=>{
 const x=syntheticStore();const authority:ReviewAuthority={assertCurrent:async()=>{},assertCurrentBudgetAndSwitches:async()=>{},currentTime:async()=>at};
 const failure:ReviewStore={transaction:async fn=>x.store.transaction(async tx=>fn({...tx,append:async()=>{throw Error('APPEND_FAILED');}}))};
 await assert.rejects(reviewRecommendation(input,authority,failure),/APPEND_FAILED/);
 assert.equal(x.record.revision,0);assert.equal(x.events.length,0);
 const unknown:ReviewStore={transaction:async fn=>{await x.store.transaction(fn);throw Error('COMMIT_OUTCOME_UNKNOWN_OPERATOR_HOLD');}};
 await assert.rejects(reviewRecommendation(input,authority,unknown),/COMMIT_OUTCOME_UNKNOWN_OPERATOR_HOLD/);
 assert.equal(x.events.length,1);
});
