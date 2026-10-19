import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { createContentRecord,transitionContent,applyContentEvent,type ContentActor,type ContentEvent } from '../content-lifecycle';
import { preparePublication,type PublicationClaim } from '../publication-handoff';
import { projectConnectorHealth } from '../connector-health';
import { SyntheticPublicationStatusProbe } from '../synthetic-publication-provider';
import { MySQLContentStore } from '../../server/mysql-content-store';
import { MySQLPublicationClaimStore } from '../../server/mysql-publication-claim-store';
import { PublicationEvidenceVerifier,publicationClaimHash,publicationEvidencePayload,type PublicationObservation } from '../../server/publication-evidence';
import { contentSQLFixture } from './helpers/content-sql-fixture';
import { reserveProductionBudget,type BudgetDatabase } from '../ai-budget-ledger';
import { evaluateProductionBudget,type ProductionPolicy,type ProductionRequest } from '../ai-budget-engine';

const now=Date.parse('2026-10-18T12:00:00Z');
const actor:ContentActor={userId:'owner1',organizationId:'org1',websiteId:'site1',role:'owner'};
const claim:PublicationClaim={organizationId:'org1',websiteId:'site1',contentId:'content1',channel:'site',reservationId:'reservation1',idempotencyKey:'publish:org1:site1:content1:site'};
const secret=Buffer.alloc(32,17); // Synthetic signing key. Never loaded from environment.
const issuer={id:'synthetic_probe',secret,revoked:false,organizationId:'org1',websiteId:'site1',channel:'site'};
function signed(result:PublicationObservation['result'],eventId='observation1',changes:Partial<PublicationObservation>={}) {
  const observation:PublicationObservation={issuer:issuer.id,eventId,organizationId:claim.organizationId,websiteId:claim.websiteId,contentId:claim.contentId,channel:claim.channel,reservationId:claim.reservationId,
    claimHash:publicationClaimHash(claim),issuedAt:new Date(now-1000).toISOString(),expiresAt:new Date(now+60000).toISOString(),result,...changes};
  return {observation,signature:createHmac('sha256',secret).update(publicationEvidencePayload(observation)).digest('hex')};
}
function scheduled(){
  let record=createContentRecord({id:'content1',organizationId:'org1',websiteId:'site1',contentType:'blog'});
  const events:ContentEvent[]=[
    {kind:'research',sources:[{url:'https://example.test/research',observedAt:new Date(now-100000).toISOString(),claim:'synthetic source'}],eventId:'research',at:new Date(now-100000).toISOString()},
    {kind:'draft',text:'This is a synthetic draft with original content.',eventId:'draft',at:new Date(now-90000).toISOString()},
    {kind:'quality',regulated:false,evidence:{factual:true,original:true,rightsCleared:true,disclosureChecked:true,ymylReviewed:true,notes:'synthetic'},eventId:'quality',at:new Date(now-80000).toISOString()},
    {kind:'approve',eventId:'approval',at:new Date(now-70000).toISOString()},
    {kind:'schedule',channel:'site',publishAt:new Date(now-1000).toISOString(),eventId:'schedule',at:new Date(now-60000).toISOString()}
  ];
  for(const event of events)record=transitionContent(record,event,actor);
  return record;
}
function setup(){const db=contentSQLFixture(scheduled(),now);return {...db,store:new MySQLPublicationClaimStore(db.pool,new PublicationEvidenceVerifier([issuer]),()=>now,db.bridge.boundary)};}
const confirmed={kind:'published' as const,providerId:'synthetic_post1',url:'https://example.test/post'};

test('shared connector projection refuses stale, future, wrong-site and absent evidence',()=>{
  const scope={organizationId:'org1',websiteId:'site1',channel:'site'};
  const evidence={...scope,status:'verified' as const,checkedAt:new Date(now-1000).toISOString(),expiresAt:new Date(now+1000).toISOString()};
  assert.equal(projectConnectorHealth(scope,null,now).state,'unknown');
  assert.equal(projectConnectorHealth(scope,evidence,now).state,'verified');
  for(const change of [{websiteId:'site2'},{organizationId:'org2'},{expiresAt:new Date(now).toISOString()},{checkedAt:new Date(now+500).toISOString()}]) assert.equal(projectConnectorHealth(scope,{...evidence,...change},now).state,'unavailable');
  assert.equal(projectConnectorHealth(scope,{...evidence,status:'disconnected'},now).state,'disconnected');
});
test('concurrent publication preparation commits one unique claim and blocks cancellation',async()=>{
  const db=setup(), record=scheduled();
  const gate={organizationId:'org1',websiteId:'site1',channel:'site',globalPaused:false,publishingEnabled:true,connectorVerified:true,reservationId:'reservation1',approvalVerified:true,authorization:db.bridge.request};
  const results=await Promise.allSettled([preparePublication(record,gate,db.store,new Date(now).toISOString()),preparePublication(record,gate,db.store,new Date(now).toISOString())]);
  assert.equal(results.filter(x=>x.status==='fulfilled').length,1);
  assert.equal(db.snapshot().record.stage,'publication_unknown');assert.equal(db.snapshot().events.size,1);
  assert.equal(db.state.commits,1);assert.equal(db.state.rollbacks,1);
  await assert.rejects(()=>applyContentEvent(new MySQLContentStore(db.pool),'content1',db.snapshot().record.version,{kind:'cancel',eventId:'cancel',at:new Date(now).toISOString()},actor),/CANCELLATION_REQUIRES_STATUS_CHECK/);
});
test('claim gates reject stale connector, wrong reservation site, tenant mismatch and disabled publication',async()=>{
  for(const modify of [(db:ReturnType<typeof setup>)=>{db.state.expiresAt=new Date(now-1).toISOString();},(db:ReturnType<typeof setup>)=>{db.state.reservationSite='site2';},(db:ReturnType<typeof setup>)=>{db.state.publishing=0;},(db:ReturnType<typeof setup>)=>{db.state.automation=0;},(db:ReturnType<typeof setup>)=>{db.state.policy=0;},(db:ReturnType<typeof setup>)=>{db.state.paused=1;}]) {
    const db=setup();modify(db);await assert.rejects(()=>db.store.claimOnce({...claim,authorization:db.bridge.request}));assert.equal(db.snapshot().claim,null);assert.equal(db.snapshot().record.stage,'scheduled');
  }
  const db=setup();await assert.rejects(()=>db.store.claimOnce({...claim,organizationId:'org2',idempotencyKey:'publish:org2:site1:content1:site'}));assert.equal(db.snapshot().claim,null);
});
test('claim and content rollback together on event persistence failure; safe retry succeeds',async()=>{
  const db=setup();db.state.failSQL='INSERT INTO growth_content_events';
  await assert.rejects(()=>db.store.claimOnce({...claim,authorization:db.bridge.request}),/SYNTHETIC_SQL_FAILURE/);
  assert.equal(db.snapshot().claim,null);assert.equal(db.snapshot().record.stage,'scheduled');
  db.state.failSQL='';assert.equal(await db.store.claimOnce({...claim,authorization:db.bridge.request}),true);
});
test('signed reconciliation commits publication, observation and audit in one transaction; exact replay is idempotent',async()=>{
  const db=setup();await db.store.claimOnce({...claim,authorization:db.bridge.request});const evidence=signed(confirmed);
  assert.equal(await db.store.reconcile(claim,evidence),'confirmed');
  const saved=db.snapshot();assert.equal(saved.record.stage,'published');assert.equal(saved.claim?.status,'confirmed');assert.equal(saved.events.size,2);assert.equal(saved.observations.size,1);
  assert.equal(await db.store.reconcile(claim,evidence),'confirmed');assert.deepEqual(db.snapshot(),saved);
  await assert.rejects(()=>db.store.reconcile(claim,signed({kind:'absent'},'absence')),/PUBLICATION_STATUS_CONFLICT/);
});
test('publication failure rolls back content, audit, observation and claim status then recovers',async()=>{
  const db=setup();await db.store.claimOnce({...claim,authorization:db.bridge.request});const before=db.snapshot();db.state.failSQL='UPDATE growth_publication_claims';
  await assert.rejects(()=>db.store.reconcile(claim,signed(confirmed)),/SYNTHETIC_SQL_FAILURE/);assert.deepEqual(db.snapshot(),before);
  db.state.failSQL='';assert.equal(await db.store.reconcile(claim,signed(confirmed)),'confirmed');
});
test('forged, expired, revoked and cross-tenant provider evidence is refused before SQL',async()=>{
  const db=setup();await db.store.claimOnce({...claim,authorization:db.bridge.request});const count=db.state.queries.length;
  const forged=signed(confirmed);forged.signature='0'.repeat(64);
  for(const input of [forged,signed(confirmed,'expired',{expiresAt:new Date(now-1).toISOString()}),signed(confirmed,'foreign',{websiteId:'site2'}),signed(confirmed,'other',{organizationId:'org2'}),signed(confirmed,'reservation',{reservationId:'reservation2'})]) await assert.rejects(()=>db.store.reconcile(claim,input));
  const revoked=new MySQLPublicationClaimStore(db.pool,new PublicationEvidenceVerifier([{...issuer,revoked:true}]),()=>now);
  await assert.rejects(()=>revoked.reconcile(claim,signed(confirmed)),/PUBLICATION_EVIDENCE_SCOPE_DENIED/);
  assert.equal(db.state.queries.length,count);
});
test('provider event ID cannot be rebound and verified absence never releases a publication claim',async()=>{
  const db=setup();await db.store.claimOnce({...claim,authorization:db.bridge.request});await db.store.reconcile(claim,signed({kind:'unknown'}));
  await assert.rejects(()=>db.store.reconcile(claim,signed(confirmed)),/PUBLICATION_EVIDENCE_REPLAY/);
  assert.equal(await db.store.reconcile(claim,signed({kind:'absent'},'absence')),'absent');assert.equal(await db.store.claimOnce({...claim,authorization:db.bridge.request}),false);
});
test('provider outage preserves unknown claim and cannot manufacture a published state',async()=>{
  const db=setup();await db.store.claimOnce({...claim,authorization:db.bridge.request});const probe=new SyntheticPublicationStatusProbe();probe.fail(claim.idempotencyKey);
  await assert.rejects(()=>probe.probe(claim.idempotencyKey),/SYNTHETIC_PROVIDER_UNAVAILABLE/);
  assert.equal(db.snapshot().claim?.status,'unknown');assert.equal(db.snapshot().record.stage,'publication_unknown');assert.equal(await db.store.claimOnce({...claim,authorization:db.bridge.request}),false);
});
test('content approval replay, viewer, unknown role, other website and organization are denied',async()=>{
  const db=setup(),store=new MySQLContentStore(db.pool), event:ContentEvent={kind:'approve',eventId:'approval',at:new Date(now).toISOString()};
  await assert.rejects(()=>applyContentEvent(store,'content1',db.snapshot().record.version,event,actor),/INVALID_CONTENT_EVENT/);
  for(const identity of [{...actor,role:'viewer' as const},{...actor,role:'invented' as never},{...actor,websiteId:'site2'},{...actor,organizationId:'org2'}]) await assert.rejects(()=>applyContentEvent(store,'content1',db.snapshot().record.version,{kind:'cancel',eventId:'cancel',at:new Date(now).toISOString()},identity));
  assert.equal(db.snapshot().record.stage,'scheduled');assert.equal(db.snapshot().events.size,0);
});
test('stale versions cannot overwrite content in concurrent scoped mutations',async()=>{
  const db=setup(),store=new MySQLContentStore(db.pool),version=db.snapshot().record.version;
  const outcomes=await Promise.allSettled(['cancel1','cancel2'].map(eventId=>applyContentEvent(store,'content1',version,{kind:'cancel',eventId,at:new Date(now).toISOString()},actor)));
  assert.equal(outcomes.filter(x=>x.status==='fulfilled').length,1);assert.equal(db.snapshot().events.size,1);assert.equal(db.snapshot().record.version,version+1);
});
test('budget requests use shared health evidence and refuse exhausted portfolio or website capacity',()=>{
  const request:ProductionRequest={organizationId:'org1',websiteId:'site1',contentType:'blog',idempotencyKey:'job1',estimatedCostMinor:25,maximumJobCostMinor:25,requestedUnits:1};
  const policy:ProductionPolicy={websiteActive:true,automationEnabled:true,globalPaused:false,connectorReady:true,weeklyLimit:1,weeklyUsedAndReserved:0,websiteMonthlyLimitMinor:25,websiteSpentAndReservedMinor:0,organizationMonthlyLimitMinor:25,organizationSpentAndReservedMinor:0};
  assert.equal(evaluateProductionBudget(request,policy).allowed,true);
  assert.equal(evaluateProductionBudget(request,{...policy,organizationSpentAndReservedMinor:1}).code,'ORGANIZATION_BUDGET_EXCEEDED');
  assert.equal(evaluateProductionBudget(request,{...policy,websiteSpentAndReservedMinor:1}).code,'WEBSITE_BUDGET_EXCEEDED');
  assert.equal(evaluateProductionBudget(request,{...policy,weeklyUsedAndReserved:1}).code,'WEEKLY_QUOTA_EXCEEDED');
  assert.equal(evaluateProductionBudget(request,{...policy,connectorReady:projectConnectorHealth(claim,null,now).state==='verified'}).code,'CONNECTOR_UNAVAILABLE');
});

test('a reserved job replay cannot bypass a newly paused organization or revoked connector',async()=>{
  const request:ProductionRequest={organizationId:'org1',websiteId:'site1',contentType:'blog',idempotencyKey:'job1',estimatedCostMinor:25,maximumJobCostMinor:25,requestedUnits:1};
  const policy:ProductionPolicy={websiteActive:true,automationEnabled:true,globalPaused:false,connectorReady:true,weeklyLimit:1,weeklyUsedAndReserved:1,websiteMonthlyLimitMinor:25,websiteSpentAndReservedMinor:25,organizationMonthlyLimitMinor:25,organizationSpentAndReservedMinor:25};
  const db:BudgetDatabase={withSerializableBudgetTransaction:async(_org,_site,work)=>work({findExisting:async()=>({...request,id:'reserved1',status:'reserved'}),loadPolicy:async()=>policy,insertReservation:async()=>{throw Error('REPLAY_MUST_NOT_INSERT');}})};
  assert.equal((await reserveProductionBudget(db,request)).replayed,true);
  policy.globalPaused=true;assert.equal((await reserveProductionBudget(db,request)).decision.code,'GLOBAL_PAUSE');
  policy.globalPaused=false;policy.connectorReady=false;assert.equal((await reserveProductionBudget(db,request)).decision.code,'CONNECTOR_UNAVAILABLE');
});
test('generic content persistence refuses caller-asserted provider trust',async()=>{
  const db=setup();await db.store.claimOnce({...claim,authorization:db.bridge.request});
  await assert.rejects(()=>applyContentEvent(new MySQLContentStore(db.pool),'content1',db.snapshot().record.version,
    {kind:'confirm_publication',eventId:'forged',at:new Date(now).toISOString(),providerId:'fake',url:'https://example.test/fake',observedAt:new Date(now).toISOString()},
    {...actor,trustedProviderEvidence:true}),/PUBLICATION_CLAIM_RECONCILIATION_REQUIRED/);
  assert.equal(db.snapshot().record.stage,'publication_unknown');
});
