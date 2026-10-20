import test from 'node:test';
import assert from 'node:assert/strict';
import type {ContentRecord} from '../content-lifecycle';
import {createPublicationJob} from '../safe-publication-jobs';
import {PublicationAtomicCoordinator,type AtomicPublicationRepository,type AtomicPublicationTransaction,type IndependentPublicationFencer} from '../publication-atomic-integration';
const now=Date.parse('2026-10-20T01:00:00Z'),iso=new Date(now).toISOString();
const record:ContentRecord={id:'content1',organizationId:'org1',websiteId:'site1',contentType:'article',stage:'scheduled',version:5,eventIds:['e1','e2','e3','e4','e5'],sources:[],draft:'Synthetic draft',quality:{factual:true,original:true,rightsCleared:true,disclosureChecked:true,ymylReviewed:false,notes:'fixture'},approval:{actorId:'owner1',at:iso},schedule:{channel:'wordpress',at:iso}};
const job=createPublicationJob(record,{id:'job1',destination:{id:'destination1',revision:'rev1',target:'https://wordpress.invalid/'}});
const ctx={organizationId:'org1',sessionHash:'a'.repeat(64)};
function fixture(){
 const state={claimCount:0,fundingCount:0,authCount:0,contentCount:0,auditCount:0,jobCount:0,commits:0,rollbacks:0,locks:0,sequence:[] as string[],revoke:false,stale:false,fail:'',funding:1,commitUnknown:false,tail:Promise.resolve()};
 const fencer:IndependentPublicationFencer={acquire:async()=>{state.locks++;return {assertCurrent:async()=>{if(state.revoke)throw Error('FENCE_REVOKED');},release:async()=>{state.locks--;}};}};
 const repo:AtomicPublicationRepository={capability:'single-transaction-publication',readCommittedIdentity:async()=>state.claimCount?'committed':'absent',transaction:async(_s,_id,_f,work)=>{
  const previous=state.tail;let release!:()=>void;state.tail=new Promise<void>(r=>release=r);await previous;
  const snapshot={claimCount:state.claimCount,fundingCount:state.fundingCount,authCount:state.authCount,contentCount:state.contentCount,auditCount:state.auditCount,jobCount:state.jobCount,funding:state.funding};
  const step=(name:string)=>{state.sequence.push(name);if(state.fail===name)throw Error('SYNTHETIC_'+name.toUpperCase()+'_FAILURE');};
  const tx:AtomicPublicationTransaction={
   lockScope:async()=>step('lock'),loadContent:async()=>{step('content');return {...record,version:state.stale?6:5};},
   authorize:async()=>{step('authorize');if(state.revoke)throw Error('TRUST_REVOKED');return {organizationId:job.organizationId,websiteId:job.websiteId,contentId:job.contentId,contentVersion:job.contentVersion,channel:job.channel,destinationId:job.destination.id,destinationRevision:job.destination.revision,destinationTarget:job.destination.target,authorizationId:'auth1',approvalEventId:'e4',connectorEvidenceHash:'f'.repeat(64),policyRevision:'policy1',publicationFundingId:'fund1',expiresAt:new Date(now+60000).toISOString()};},
   checkPublicationFunding:async()=>{step('budget');if(snapshot.funding!==1)throw Error('BUDGET_EXHAUSTED');},
   insertClaim:async()=>{step('claim');if(snapshot.claimCount)throw Error('DUPLICATE_PUBLICATION_CLAIM');snapshot.claimCount++;},
   startFunding:async()=>{step('fund');if(snapshot.fundingCount)throw Error('DUPLICATE_FUNDING');snapshot.fundingCount++;snapshot.funding--;},
   consumeAuthorization:async()=>{step('consume');if(snapshot.authCount)throw Error('APPROVAL_REPLAY');snapshot.authCount++;},
   contentUnknown:async()=>{step('unknown');snapshot.contentCount++;},appendAudit:async()=>{step('audit');snapshot.auditCount++;},
   saveUnknownJob:async()=>{step('job');snapshot.jobCount++;},checkCommitBoundary:async()=>{step('boundary');if(state.revoke)throw Error('CONNECTOR_REVOKED');}
  };
  try{const result=await work(tx);step('commit');Object.assign(state,snapshot);state.commits++;if(state.commitUnknown)throw Object.assign(Error('Unknown commit'),{code:'PUBLICATION_COMMIT_INDETERMINATE'});return result;}
  catch(e){state.rollbacks++;throw e;}finally{release();}
 }};
 return {state,coordinator:new PublicationAtomicCoordinator(fencer,repo,()=>now)};
}
test('synthetic single transaction stages one claim, funding start, authorization, unknown status, audit and job in order',async()=>{
 const f=fixture(),claim=await f.coordinator.claim(job,ctx);assert.equal(claim.reservationId,'fund1');assert.equal(f.state.commits,1);assert.equal(f.state.fundingCount,1);assert.equal(f.state.contentCount,1);assert.equal(f.state.locks,0);
 assert.deepEqual(f.state.sequence,['lock','content','authorize','budget','claim','fund','consume','unknown','audit','job','boundary','commit']);
 await assert.rejects(()=>f.coordinator.claim(job,ctx),/DUPLICATE_PUBLICATION_CLAIM|BUDGET_EXHAUSTED/);assert.equal(f.state.claimCount,1);
});
test('synthetic concurrency admits one claim, never double charges and rolls back any failed stage',async()=>{
 const f=fixture(),out=await Promise.allSettled(Array.from({length:12},()=>f.coordinator.claim(job,ctx)));
 assert.equal(out.filter(v=>v.status==='fulfilled').length,1);assert.equal(f.state.claimCount,1);assert.equal(f.state.fundingCount,1);assert.equal(f.state.authCount,1);
 for(const phase of ['fund','consume','unknown','audit','job','boundary','commit']){
  const g=fixture();g.state.fail=phase;await assert.rejects(()=>g.coordinator.claim(job,ctx),/SYNTHETIC_/);
  assert.equal(g.state.claimCount,0);assert.equal(g.state.fundingCount,0);assert.equal(g.state.authCount,0);assert.equal(g.state.contentCount,0);assert.equal(g.state.auditCount,0);assert.equal(g.state.jobCount,0);assert.equal(g.state.commits,0);
 }
});
test('synthetic stale content, revoked connector/fence, unfunded reservation and tenant mismatch refuse',async()=>{
 for(const mode of ['stale','revoke','funding'] as const){const f=fixture();if(mode==='stale')f.state.stale=true;if(mode==='revoke')f.state.revoke=true;if(mode==='funding')f.state.funding=0;await assert.rejects(()=>f.coordinator.claim(job,ctx));assert.equal(f.state.claimCount,0);assert.equal(f.state.commits,0);}
 const f=fixture();await assert.rejects(()=>f.coordinator.claim(job,{...ctx,organizationId:'other'}),/PUBLICATION_INTENT_DENIED/);assert.equal(f.state.locks,0);
});
test('an unknown commit permits readback only and enters operator hold without a second claim',async()=>{
 const f=fixture();f.state.commitUnknown=true;await assert.rejects(()=>f.coordinator.claim(job,ctx),/PUBLICATION_COMMIT_INDETERMINATE_COMMITTED_OPERATOR_HOLD/);
 assert.equal(f.state.claimCount,1);assert.equal(f.state.fundingCount,1);assert.equal(f.state.sequence.filter(x=>x==='claim').length,1);assert.equal(f.state.locks,0);
});
