import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { createContentRecord, transitionContent, type ContentEvent } from '../content-lifecycle';
import { preparePublication, type PublicationClaim } from '../publication-handoff';
import { contentSQLFixture } from './helpers/content-sql-fixture';
import { MySQLPublicationClaimStore } from '../../server/mysql-publication-claim-store';
import { ConnectorEvidenceVerifier, connectorEvidencePayload } from '../../server/connector-evidence';
const now=Date.parse('2026-10-19T12:00:00.000Z');
function setup() {
  const at=new Date(now-120000).toISOString();
  const actor={userId:'approver1',organizationId:'org1',websiteId:'site1',role:'owner' as const};
  let record=createContentRecord({id:'content1',organizationId:actor.organizationId,websiteId:actor.websiteId,contentType:'blog'});
  const events:ContentEvent[]=[
    {kind:'research',eventId:'research',at,sources:[{url:'https://example.test/source',observedAt:at,claim:'Synthetic evidence'}]},
    {kind:'draft',eventId:'draft',at,text:'A fully synthetic original draft for regression tests.'},
    {kind:'quality',eventId:'quality',at,regulated:false,evidence:{factual:true,original:true,rightsCleared:true,disclosureChecked:true,ymylReviewed:true,notes:'synthetic'}},
    {kind:'approve',eventId:'approve',at},
    {kind:'schedule',eventId:'schedule',at,channel:'site',publishAt:new Date(now-1000).toISOString()}
  ];
  for(const event of events)record=transitionContent(record,event,actor);
  const db=contentSQLFixture(record,now);
  const store=new MySQLPublicationClaimStore(db.pool,undefined,()=>now,db.bridge.boundary);
  const claim:PublicationClaim={organizationId:record.organizationId,websiteId:record.websiteId,contentId:record.id,channel:'site',idempotencyKey:'publish:org1:site1:content1:site',reservationId:'reservation1',authorization:db.bridge.request};
  return {...db,store,claim,record};
}
type DB=ReturnType<typeof setup>;
const negativeCases: [string,(db:DB)=>void][]=[
  ['missing authorization',db=>{db.claim.authorization=undefined;}],
  ['wrong organization',db=>{db.claim.organizationId='org2';db.claim.idempotencyKey='publish:org2:site1:content1:site';}],
  ['foreign approval organization',db=>{db.state.approval.organizationId='org2';}],
  ['foreign approval website',db=>{db.state.approval.websiteId='site2';}],
  ['foreign approval content',db=>{db.state.approval.contentId='content2';}],
  ['stale approval version',db=>{db.state.approval.contentVersion++;}],
  ['stale request version',db=>{db.claim.authorization={...db.bridge.request,contentVersion:0};}],
  ['same-version content fingerprint mismatch',db=>{db.state.approval.contentHash='0'.repeat(64);}],
  ['changed reservation',db=>{db.state.approval.reservationId='reservation2';}],
  ['internal decision cannot authorize publication',db=>{db.state.approval.purpose='internal_decision' as never;}],
  ['rejected decision',db=>{db.state.approval.decision='rejected' as never;}],
  ['missing durable content approval event',db=>{db.state.approvalEventMissing=true;}],
  ['forged durable approver identity',db=>{db.state.approvalEventActor='other';}],
  ['rebound approval decision id',db=>{db.state.approval.approvalDecisionId='other';}],
  ['missing approval',db=>{db.claim.authorization={...db.bridge.request,authorizationId:'missing'};}],
  ['revoked approval',db=>{db.state.approvalRevoked=true;}],
  ['expired approval',db=>{db.state.approval.expiresAt=new Date(now).toISOString();}],
  ['future authorization',db=>{db.state.approval.issuedAt=new Date(now+1000).toISOString();}],
  ['revoked session',db=>{db.state.sessionRevoked=true;}],
  ['expired session',db=>{db.state.sessionExpires=new Date(now).toISOString();}],
  ['unknown session',db=>{db.claim.authorization={...db.bridge.request,sessionTokenHash:'b'.repeat(64)};}],
  ['disabled user',db=>{db.state.userDisabled=1;}],
  ['removed membership',db=>{db.state.membership=false;}],
  ['viewer requestor',db=>{db.state.requestorRole='viewer';}],
  ['editor requestor',db=>{db.state.requestorRole='editor';}],
  ['unknown requestor role',db=>{db.state.requestorRole='invented';}],
  ['viewer approver',db=>{db.state.approverRole='viewer';}],
  ['changed policy revision',db=>{db.state.policyRevision='revision2';}],
  ['disabled feature',db=>{db.state.feature=0;}],
  ['global pause',db=>{db.state.paused=1;}],
  ['disabled website publishing',db=>{db.state.publishing=0;}],
  ['disabled automation',db=>{db.state.automation=0;}],
  ['disabled content policy',db=>{db.state.policy=0;}],
  ['unavailable budget',db=>{db.state.budgetAvailable=false;}],
  ['cancelled reservation',db=>{db.state.reservationStatus='cancelled';}],
  ['missing actual-cost accounting',db=>{db.state.actualCost=null;}],
  ['invalid actual-cost accounting',db=>{db.state.actualCost='-1';}],
  ['wrong reservation website',db=>{db.state.reservationSite='site2';}],
  ['changed destination target',db=>{db.state.destination.target='https://example.test/other-account';}],
  ['changed destination revision',db=>{db.state.destination.revision='revision2';}],
  ['disabled destination',db=>{db.state.destination.enabled=false;}],
  ['wrong destination id',db=>{db.claim.authorization={...db.bridge.request,destinationId:'destination2'};}],
  ['revoked connector attestation',db=>{db.state.connectorRevoked=true;}],
  ['current issuer revocation',db=>{db.state.issuerRevoked=1;}],
  ['changed trust revision',db=>{db.state.trustRevision='revision2';}],
  ['forged connector signature',db=>{db.state.attestation.signature='0'.repeat(64);}],
  ['expired connector evidence',db=>{db.state.attestation.evidence.expiresAt=new Date(now).toISOString();}],
  ['future connector evidence',db=>{db.state.attestation.evidence.checkedAt=new Date(now+1000).toISOString();}],
];
for(const [name,change] of negativeCases) test(`bridge refuses ${name} atomically`,async()=>{
  const db=setup();change(db);
  await assert.rejects(()=>db.store.claimOnce(db.claim));
  assert.equal(db.state.commits,0);assert.equal(db.snapshot().claim,null);assert.equal(db.snapshot().consumed,false);assert.equal(db.snapshot().authorizationUses.size,0);assert.equal(db.snapshot().record.stage,'scheduled');
});
test('twenty concurrent claims consume the authorization and create audit/content evidence exactly once',async()=>{
  const db=setup();const results=await Promise.all(Array.from({length:20},()=>db.store.claimOnce(db.claim)));
  assert.equal(results.filter(Boolean).length,1);assert.equal(db.snapshot().authorizationUses.size,1);assert.equal(db.snapshot().events.size,1);assert.equal(db.snapshot().consumed,true);
  await assert.rejects(()=>db.store.claimOnce({...db.claim,contentId:'content2',idempotencyKey:'publish:org1:site1:content2:site'}));
});
test('claim, authorization consumption, audit and content rollback together and recover with same identity',async()=>{
  for(const sql of ['INSERT INTO growth_publication_authorization_uses','UPDATE growth_content_records','INSERT INTO growth_content_events','UPDATE growth_content_authorizations']) {
    const db=setup();db.state.failSQL=sql;await assert.rejects(()=>db.store.claimOnce(db.claim),/SYNTHETIC_SQL_FAILURE/);
    assert.equal(db.snapshot().claim,null);assert.equal(db.snapshot().consumed,false);assert.equal(db.snapshot().authorizationUses.size,0);
    db.state.failSQL='';assert.equal(await db.store.claimOnce(db.claim),true);
  }
});
test('validly signed nonverified, wrong-scope and read-only attestations never grant publish authority',async()=>{
  for(const change of [{status:'unknown'},{status:'disconnected'},{status:'unavailable'},{capabilities:['read']},{organizationId:'org2'},{websiteId:'site2'},{destinationId:'destination2'},{destinationTarget:'https://example.test/other'},{destinationRevision:'changed'},{channel:'other'}]) {
    const db=setup();Object.assign(db.state.attestation.evidence,change);
    db.state.attestation.signature=createHmac('sha256',db.bridge.issuer.secret).update(connectorEvidencePayload(db.state.attestation.evidence)).digest('hex');
    await assert.rejects(()=>db.store.claimOnce(db.claim));assert.equal(db.snapshot().claim,null);
  }
});
test('empty, revoked, duplicate or weak issuer configuration cannot establish verified health',()=>{
  const db=setup(),e=db.bridge.signed,d=db.bridge.destination,current={issuer:db.bridge.issuer.id,keyId:db.bridge.issuer.keyId,revision:db.bridge.issuer.trustRevision,revoked:false};
  assert.throws(()=>new ConnectorEvidenceVerifier().verify(e,d,current,now));
  assert.throws(()=>new ConnectorEvidenceVerifier([{...db.bridge.issuer,revoked:true}]).verify(e,d,current,now));
  assert.throws(()=>new ConnectorEvidenceVerifier([db.bridge.issuer,db.bridge.issuer]));
  assert.throws(()=>new ConnectorEvidenceVerifier([{...db.bridge.issuer,secret:Buffer.alloc(8)}]));
});
test('preparation forwards server authorization once but does not return session digests or enable publishing',async()=>{
  const db=setup(),gate={organizationId:'org1',websiteId:'site1',channel:'site',globalPaused:false,publishingEnabled:true,connectorVerified:true,approvalVerified:true,reservationId:'reservation1',authorization:db.bridge.request};
  const prepared=await preparePublication(db.record,gate,db.store,new Date(now).toISOString());
  assert.equal(prepared.status,'prepared');assert.equal(prepared.claim.authorization,undefined);assert.equal(JSON.stringify(prepared).includes(db.bridge.request.sessionTokenHash),false);
  assert.equal(db.snapshot().record.stage,'publication_unknown');assert.equal(db.snapshot().claim?.status,'unknown');
});
test('preparation booleans alone never reach claim storage',async()=>{
  const db=setup();let calls=0;
  const gate={organizationId:'org1',websiteId:'site1',channel:'site',globalPaused:false,publishingEnabled:true,connectorVerified:true,approvalVerified:true,reservationId:'reservation1'};
  await assert.rejects(()=>preparePublication(db.record,gate,{claimOnce:async()=>{calls++;return true;}},new Date(now).toISOString()));assert.equal(calls,0);
});

test('authorization expiring between check and consumption rolls the entire claim back',async()=>{
  const db=setup();let calls=0;
  const clock=()=>++calls<4?now:now+60000;
  const store=new MySQLPublicationClaimStore(db.pool,undefined,clock,db.bridge.boundary);
  await assert.rejects(()=>store.claimOnce(db.claim),/PUBLICATION_AUTHORIZATION_EXPIRED/);
  assert.equal(db.snapshot().claim,null);assert.equal(db.snapshot().consumed,false);assert.equal(db.snapshot().authorizationUses.size,0);
});
