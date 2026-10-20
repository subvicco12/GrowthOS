import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,createHmac} from 'node:crypto';
import {createContentRecord,type ContentRecord} from '../content-lifecycle';
import {publicationBridgeFixture} from './helpers/publication-bridge-fixture';
import {PublicationAuthorizationIssuer,issuanceSessionContext,type AuthorizationIssuerStore,type IssuanceSnapshot} from '../../server/authorization-issuance';
import {authorizationHttpHandler} from '../../server/authorization-http';
import {ConnectorTrustService,connectorTrustKey,probeControlPayload,revokeConnectorTrust,type TrustCheckpoint,type IndependentTrustAnchor,type ConnectorEvidenceRepository,type SequencedConnectorProbe} from '../../server/connector-trust';
import type {Pool} from 'mysql2/promise';
import {MySQLConnectorEvidenceStore} from '../../server/mysql-connector-evidence-store';
import {MySQLAuthorizationIssuerStore} from '../../server/mysql-authorization-issuer-store';
import {contentSQLFixture} from './helpers/content-sql-fixture';
import {MySQLPublicationAuthorization} from '../../server/mysql-publication-authorization';
import {connectorEvidencePayload,ConnectorEvidenceVerifier} from '../../server/connector-evidence';
const now=Date.parse('2026-10-20T00:00:00.000Z');
const timestamp=new Date(now-1000).toISOString();
function records(){
  const record:ContentRecord={...createContentRecord({id:'content1',organizationId:'org1',websiteId:'site1',contentType:'blog'}),version:5,stage:'scheduled',eventIds:['research','draft','quality','approve','schedule'],draft:'Synthetic approved content for offline tests',approval:{actorId:'approver1',at:timestamp},schedule:{channel:'site',at:timestamp},quality:{factual:true,original:true,rightsCleared:true,disclosureChecked:true,ymylReviewed:true,notes:'synthetic'}};
  const bridge=publicationBridgeFixture(record,now);
  const approved={...record,stage:'approved' as const,version:4,eventIds:record.eventIds.slice(0,-1)};delete approved.schedule;
  return {record,approved,bridge};
}
function issuanceFixture(){
  const {record,approved,bridge}=records();
  let data={authorization:null as typeof bridge.authorization|null,revoked:false,consumed:false,audits:new Map<string,unknown>()},tail=Promise.resolve();
  const state={role:'owner',member:true,session:true,disabled:false,expires:now+60000,execution:true,failAudit:false};
  const snapshot:IssuanceSnapshot={record,approvedRecord:approved,policy:bridge.policy,destination:bridge.destination,approver:{organizationId:'org1',userId:'approver1',role:'owner',disabled:false},approvalEventId:'approve',approvalActorId:'approver1',approvalAt:timestamp,reservation:{id:'reservation1',organizationId:'org1',websiteId:'site1',contentType:'blog',status:'completed',actualCostMinor:'20'}};
  const store:AuthorizationIssuerStore={capability:'authorization-issuer',transaction:async(scope,work)=>{
    const previous=tail;let done!:()=>void;tail=new Promise<void>(r=>{done=r;});await previous;const copy=structuredClone(data);
    try{return await work({
      authenticate:async()=>{if(!state.session)throw Error('SESSION_REQUIRED');return {member:{organizationId:state.member?scope.organizationId:'removed',userId:'requestor1',role:state.role,disabled:state.disabled},expiresAt:state.expires};},
      load:async()=>structuredClone(snapshot),find:async id=>data.authorization?.id===id?{authorization:structuredClone(data.authorization),revoked:data.revoked,consumed:data.consumed}:null,
      requestSeen:async key=>data.audits.has(key),insert:async a=>{if(data.authorization)throw Error('DUPLICATE_APPROVAL');data.authorization=structuredClone(a);},
      revoke:async()=>{if(data.revoked||data.consumed)throw Error('AUTHORIZATION_ALREADY_TERMINAL');data.revoked=true;},
      audit:async e=>{if(state.failAudit)throw Error('AUDIT_UNAVAILABLE');data.audits.set(e.key,e);},
      checkExecution:async()=>{if(!state.execution)throw Error('QUOTA_OR_CONNECTOR_UNAVAILABLE');}
    });}catch(error){data=copy;throw error;}finally{done();}
  }};
  const service=new PublicationAuthorizationIssuer(store,()=>now,()=> 'issued1');
  const command={action:'issue' as const,websiteId:'site1',contentId:'content1',contentVersion:5,destinationId:'destination1',reservationId:'reservation1',expectedContentHash:bridge.authorization.contentHash,expectedPolicyHash:bridge.authorization.policyHash,expectedDestinationRevision:bridge.destination.revision,expectedDestinationTarget:bridge.destination.target,approvalEventId:'approve',idempotencyKey:'request1',explicitConsent:true as const};
  const context={sessionHash:'a'.repeat(64),organizationId:'org1'};
  return {service,store,state,snapshot,command,context,saved:()=>structuredClone(data),consume:()=>{data.consumed=true;}};
}
test('concurrent explicit issuance commits exactly one immutable authorization and audit',async()=>{
  const f=issuanceFixture();const results=await Promise.allSettled(Array.from({length:10},()=>f.service.execute(f.context,f.command)));
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(f.saved().audits.size,1);assert.equal(f.saved().authorization?.approverId,'approver1');
  await assert.rejects(()=>f.service.execute(f.context,{...f.command,idempotencyKey:'different'}),/DUPLICATE_APPROVAL/);
});
const issuanceNegatives:[string,(f:ReturnType<typeof issuanceFixture>)=>void][]=[
 ['revoked session',f=>{f.state.session=false;}],['removed membership',f=>{f.state.member=false;}],['viewer role',f=>{f.state.role='viewer';}],['editor role',f=>{f.state.role='editor';}],['disabled user',f=>{f.state.disabled=true;}],['session expiry',f=>{f.state.expires=now;}],
 ['stale version',f=>{f.command.contentVersion=4;}],['changed policy',f=>{f.snapshot.policy.revision='changed';}],['feature shutdown',f=>{f.snapshot.policy.featureEnabled=false;}],['global pause',f=>{f.snapshot.policy.globalPaused=true;}],['disabled website',f=>{f.snapshot.policy.siteActive=false;}],['disabled automation',f=>{f.snapshot.policy.automationEnabled=false;}],
 ['changed destination',f=>{f.snapshot.destination.revision='changed';}],['cross website',f=>{f.command.websiteId='site2';}],['cross tenant',f=>{f.context.organizationId='org2';}],['missing approval event',f=>{f.snapshot.approvalEventId='missing';}],['revoked approver membership',f=>{f.snapshot.approver.role='viewer';}],['invalid reservation',f=>{f.snapshot.reservation.status='cancelled';}],['unknown accounting state',f=>{f.snapshot.reservation.actualCostMinor=null;}],['exhausted quota or connector unavailable',f=>{f.state.execution=false;}]
];
for(const [name,change]of issuanceNegatives)test(`issuance refuses ${name}`,async()=>{const f=issuanceFixture();change(f);await assert.rejects(()=>f.service.execute(f.context,f.command));assert.equal(f.saved().authorization,null);assert.equal(f.saved().audits.size,0);});
test('issuance audit failure rolls back; exact identity can recover without duplicate issuance',async()=>{
 const f=issuanceFixture();f.state.failAudit=true;await assert.rejects(()=>f.service.execute(f.context,f.command));assert.equal(f.saved().authorization,null);f.state.failAudit=false;await f.service.execute(f.context,f.command);await assert.rejects(()=>f.service.execute(f.context,f.command),/REPLAY/);
});
test('revocation remains authorized under shutdown; consumed or revoked authorizations never reset',async()=>{
 const f=issuanceFixture();await f.service.execute(f.context,f.command);f.state.execution=false;
 await f.service.execute(f.context,{action:'revoke',websiteId:'site1',authorizationId:'issued1',idempotencyKey:'revoke1'});assert.equal(f.saved().revoked,true);
 await assert.rejects(()=>f.service.execute(f.context,{action:'revoke',websiteId:'site1',authorizationId:'issued1',idempotencyKey:'revoke2'}),/TERMINAL/);
 f.state.session=false;await assert.rejects(()=>f.service.execute(f.context,{action:'revoke',websiteId:'site1',authorizationId:'issued1',idempotencyKey:'revoke3'}));
});
function trustFixture(){
 const {bridge}=records(),issuer={...bridge.issuer,generation:1,capabilities:['read','publish'] as const};
 let anchored:TrustCheckpoint={revision:issuer.trustRevision,generation:1,revoked:false,sequence:0,hash:null,pending:null},tail=Promise.resolve();
 const anchor:IndependentTrustAnchor={exclusive:async(_key,work)=>{const old=tail;let release!:()=>void;tail=new Promise<void>(r=>{release=r;});await old;try{return await work({read:async()=>structuredClone(anchored),compareAndSet:async(prev,next)=>{assert.deepEqual(prev,anchored);if(next.generation<prev.generation||next.sequence<prev.sequence||(prev.revoked&&!next.revoked))throw Error('ANCHOR_ROLLBACK');anchored=structuredClone(next);}});}finally{release();}}};
 let persisted:{sequence:number;hash:string;probe:SequencedConnectorProbe}|null=null;const seen=new Map<string,string>();
 const state={fail:false,failAfterCommit:false};
 const repository:ConnectorEvidenceRepository={capability:'connector-evidence-writer',readCurrent:async()=>structuredClone(persisted),commitObservation:async i=>{
  if(state.fail)throw Error('DB_UNAVAILABLE');
  if(seen.has(i.signed.evidence.eventId)){if(seen.get(i.signed.evidence.eventId)!==i.hash||persisted?.hash!==i.hash)throw Error('EVENT_REBOUND');return;}
  if((persisted?.hash??null)!==i.previous)throw Error('DB_ROLLBACK');
  seen.set(i.signed.evidence.eventId,i.hash);persisted={sequence:i.sequence,hash:i.hash,probe:structuredClone(i.probe)};if(state.failAfterCommit)throw Error('LOST_COMMIT_REPLY');
 }};
 const service=new ConnectorTrustService([issuer],anchor,repository);
 function probe(sequence=1,previousHash:string|null=null){
  const attestation=structuredClone(bridge.signed);attestation.evidence.eventId=`probe${sequence}`;
  attestation.signature=createHmac('sha256',issuer.secret).update(connectorEvidencePayload(attestation.evidence)).digest('hex');
  const input={attestation,sequence,previousHash,generation:1};return {...input,controlSignature:createHmac('sha256',issuer.secret).update(probeControlPayload(input)).digest('hex')};
 }
 async function check(){return service.withClaimLease(issuer.id,issuer.keyId,async checkpoint=>{const saved=persisted!;const v=new ConnectorEvidenceVerifier([issuer]).verify(saved.probe.attestation,bridge.destination,{issuer:issuer.id,keyId:issuer.keyId,revision:issuer.trustRevision,revoked:false},now);await checkpoint.assertCurrent({signed:saved.probe.attestation,payloadHash:v.payloadHash,trust:{issuer:issuer.id,keyId:issuer.keyId,revision:issuer.trustRevision,revoked:false}});return checkpoint;});}
 return {service,anchor,repository,state,probe,check,issuer,bridge,anchorState:()=>structuredClone(anchored),saved:()=>structuredClone(persisted),restore:(v:typeof persisted)=>{persisted=structuredClone(v);}};
}
test('signed sequenced evidence ingestion survives service restart; no local cache establishes trust',async()=>{
 const f=trustFixture();await f.service.ingest(f.probe(),f.bridge.destination,now);await f.check();
 const restarted=new ConnectorTrustService([f.issuer],f.anchor,f.repository);
 await restarted.withClaimLease(f.issuer.id,f.issuer.keyId,async checkpoint=>{const p=f.saved()!.probe;await checkpoint.assertCurrent({signed:p.attestation,payloadHash:createHash('sha256').update(connectorEvidencePayload(p.attestation.evidence)).digest('hex'),trust:{issuer:f.issuer.id,keyId:f.issuer.keyId,revision:f.issuer.trustRevision,revoked:false}});});
});
test('forged control/base signatures, stale evidence, foreign destinations and capabilities refuse before anchor advance',async()=>{
 for(const mutate of [(p:SequencedConnectorProbe)=>{p.controlSignature='0'.repeat(64);},(p:SequencedConnectorProbe)=>{p.attestation.signature='0'.repeat(64);},(p:SequencedConnectorProbe)=>{p.attestation.evidence.expiresAt=new Date(now).toISOString();},(p:SequencedConnectorProbe)=>{p.attestation.evidence.websiteId='foreign';}]){
  const f=trustFixture(),p=f.probe();mutate(p);await assert.rejects(()=>f.service.ingest(p,f.bridge.destination,now));assert.equal(f.anchorState().sequence,0);assert.equal(f.saved(),null);
 }
});
test('database rollback, stale replay and event rebinding cannot restore connector trust',async()=>{
 const f=trustFixture();await f.service.ingest(f.probe(),f.bridge.destination,now);const old=f.saved();
 await f.service.ingest(f.probe(2,old!.hash),f.bridge.destination,now);await f.check();
 await assert.rejects(()=>f.service.ingest(f.probe(),f.bridge.destination,now),/REPLAY|ROLLBACK/);
 f.restore(old);await assert.rejects(()=>f.check(),/DATABASE_ROLLBACK/);assert.equal(f.anchorState().sequence,2);
});
test('failed and interrupted ingestion stays pending and permits only exact-envelope recovery',async()=>{
 for(const failure of ['fail','failAfterCommit'] as const){const f=trustFixture(),p=f.probe();f.state[failure]=true;await assert.rejects(()=>f.service.ingest(p,f.bridge.destination,now));assert.ok(f.anchorState().pending);
  await assert.rejects(()=>f.service.withClaimLease(f.issuer.id,f.issuer.keyId,async c=>c.assertCurrent({signed:p.attestation,payloadHash:'0'.repeat(64),trust:{issuer:f.issuer.id,keyId:f.issuer.keyId,revision:f.issuer.trustRevision,revoked:false}})),/ANCHOR_DENIED/);
  await assert.rejects(()=>f.service.ingest(f.probe(2),f.bridge.destination,now),/RECOVERY_REQUIRED/);f.state[failure]=false;await f.service.ingest(p,f.bridge.destination,now);assert.equal(f.anchorState().pending,null);await f.check();
 }
});
test('independent revocation is irreversible despite DB restore or audit failure',async()=>{
 const f=trustFixture();await f.service.ingest(f.probe(),f.bridge.destination,now);const old=f.saved();
 await assert.rejects(()=>revokeConnectorTrust(f.anchor,{capability:'trust-administrator',authorizeRevocation:async()=>{},auditRevocation:async()=>{throw Error('AUDIT_UNAVAILABLE');}},connectorTrustKey(f.issuer),1),/AUDIT_UNAVAILABLE/);
 f.restore(old);await assert.rejects(()=>f.check(),/ANCHOR_DENIED/);await assert.rejects(()=>f.service.ingest(f.probe(2,old!.hash),f.bridge.destination,now),/REVOKED/);assert.equal(f.anchorState().revoked,true);
});
test('a claim lease serializes revocation and expires after its whole callback',async()=>{
 const f=trustFixture();await f.service.ingest(f.probe(),f.bridge.destination,now);
 const escaped=await f.check();await assert.rejects(()=>escaped.assertCurrent({signed:f.saved()!.probe.attestation,payloadHash:'0'.repeat(64),trust:{issuer:f.issuer.id,keyId:f.issuer.keyId,revision:f.issuer.trustRevision,revoked:false}}),/LEASE_EXPIRED/);
 const events:string[]=[];await Promise.all([f.service.withClaimLease(f.issuer.id,f.issuer.keyId,async()=>{events.push('claim-start');await Promise.resolve();events.push('claim-commit');}),revokeConnectorTrust(f.anchor,{capability:'trust-administrator',authorizeRevocation:async()=>{},auditRevocation:async()=>{events.push('revoked');}},connectorTrustKey(f.issuer),1)]);assert.deepEqual(events,['claim-start','claim-commit','revoked']);
});
test('HTTP factory enforces strict Origin, bounded JSON, secure-cookie identity and deny-by-default wiring',async()=>{
 const previous=process.env.GROWTHOS_APP_ORIGIN;process.env.GROWTHOS_APP_ORIGIN='https://growthos.test';
 try{
  const f=issuanceFixture(),handler=authorizationHttpHandler(f.service);
  const request=(body:unknown,headers:Record<string,string>={})=>new Request('https://growthos.test/api/publication-authorizations',{method:'POST',headers:{host:'growthos.test',origin:'https://growthos.test',cookie:`growthos_session=${'a'.repeat(43)}; growthos_organization=org1`,'content-type':'application/json',...headers},body:JSON.stringify(body)});
  assert.equal((await handler(request(f.command,{origin:'https://forged.test'}))).status,403);
  assert.equal((await handler(request(f.command,{host:'forged.test'}))).status,403);
  assert.equal((await handler(request({...f.command,explicitConsent:false}))).status,400);
  assert.equal((await handler(request(f.command,{cookie:''}))).status,401);
  assert.equal((await handler(request({...f.command,actorId:'forged'}))).status,400);
  assert.equal((await handler(request({padding:'x'.repeat(5000)}))).status,413);
  assert.equal((await authorizationHttpHandler(null)(request(f.command))).status,503);
  assert.equal((await handler(request(f.command))).status,200);
  assert.throws(()=>issuanceSessionContext(request(f.command,{cookie:`growthos_session=${'a'.repeat(43)};growthos_session=${'b'.repeat(43)};growthos_organization=org1`})),/SESSION_REQUIRED/);
 }finally{if(previous===undefined)delete process.env.GROWTHOS_APP_ORIGIN;else process.env.GROWTHOS_APP_ORIGIN=previous;}
});

test('SQL issuance adapter loads current scoped records and atomically writes authorization plus audit',async()=>{
 const {record}=records(),db=contentSQLFixture(record,now),f=issuanceFixture();
 const service=new PublicationAuthorizationIssuer(new MySQLAuthorizationIssuerStore(db.pool,db.bridge.boundary,()=>now),()=>now,()=> 'issued1');
 await service.execute(f.context,f.command);assert.equal(db.snapshot().issuedAuth?.id,'issued1');assert.equal(db.snapshot().issuanceAudit.size,1);
 const failed=contentSQLFixture(record,now);failed.state.failSQL='INSERT INTO growth_publication_authorization_events';
 const broken=new PublicationAuthorizationIssuer(new MySQLAuthorizationIssuerStore(failed.pool,failed.bridge.boundary,()=>now),()=>now,()=> 'issued1');
 await assert.rejects(()=>broken.execute(f.context,f.command),/SYNTHETIC_SQL_FAILURE/);assert.equal(failed.snapshot().issuedAuth,null);assert.equal(failed.snapshot().issuanceAudit.size,0);
});
test('consumed authorization cannot be revoked or reissued',async()=>{
 const f=issuanceFixture();await f.service.execute(f.context,f.command);f.consume();
 await assert.rejects(()=>f.service.execute(f.context,{action:'revoke',websiteId:'site1',authorizationId:'issued1',idempotencyKey:'revoke'}),/TERMINAL/);
 await assert.rejects(()=>f.service.execute(f.context,{...f.command,idempotencyKey:'new-request'}),/DUPLICATE/);
});
test('publication consumers default to denial without independent checkpoint and execution guard',async()=>{
 const {record,bridge}=records(),db=contentSQLFixture(record,now),claim={organizationId:'org1',websiteId:'site1',contentId:'content1',channel:'site',reservationId:'reservation1',idempotencyKey:'publish:org1:site1:content1:site',authorization:bridge.request};
 const verifier=new ConnectorEvidenceVerifier([bridge.issuer]);
 const switches={globalPaused:false,siteActive:true,websiteVerified:true,automationEnabled:true,publishingEnabled:true,contentPublishingEnabled:true};
 const c=await db.pool.getConnection();await c.beginTransaction();
 try{
  await assert.rejects(()=>new MySQLPublicationAuthorization(verifier).authorize(c,claim,record,switches,now),/CHECKPOINT_UNAVAILABLE/);
  await assert.rejects(()=>new MySQLPublicationAuthorization(verifier,{assertCurrent:async()=>{}}).authorize(c,claim,record,switches,now),/EXECUTION_GATE_UNAVAILABLE/);
  await assert.rejects(()=>new MySQLPublicationAuthorization(verifier,{assertCurrent:async()=>{}},{check:async()=>{throw Error('QUOTA_EXHAUSTED');}}).authorize(c,claim,record,switches,now),/QUOTA_EXHAUSTED/);
 }finally{await c.rollback();c.release();}
});
test('valid negative probes are recorded but never authorize publishing; capabilities are explicit',async()=>{
 const f=trustFixture(),p=f.probe();p.attestation.evidence.status='disconnected';p.attestation.evidence.capabilities=['read'];
 p.attestation.signature=createHmac('sha256',f.issuer.secret).update(connectorEvidencePayload(p.attestation.evidence)).digest('hex');p.controlSignature=createHmac('sha256',f.issuer.secret).update(probeControlPayload(p)).digest('hex');
 await f.service.ingest(p,f.bridge.destination,now);await assert.rejects(()=>f.check(),/NOT_PUBLISH_VERIFIED/);
 const g=trustFixture(),readOnly=new ConnectorTrustService([{...g.issuer,capabilities:['read']}],g.anchor,g.repository);
 await assert.rejects(()=>readOnly.ingest(g.probe(),g.bridge.destination,now),/CAPABILITY_DENIED/);assert.equal(g.anchorState().hash,null);
});
test('valid control signature does not excuse a forged base probe signature',async()=>{
 const f=trustFixture(),p=f.probe();p.attestation.signature='0'.repeat(64);p.controlSignature=createHmac('sha256',f.issuer.secret).update(probeControlPayload(p)).digest('hex');
 await assert.rejects(()=>f.service.ingest(p,f.bridge.destination,now),/SIGNATURE_INVALID/);assert.equal(f.saved(),null);
});
test('concurrent probe submissions advance only one sequence',async()=>{
 const f=trustFixture(),p=f.probe();const results=await Promise.allSettled(Array.from({length:10},()=>f.service.ingest(p,f.bridge.destination,now)));
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(f.anchorState().sequence,1);
});

test('SQL connector writer commits immutable history, current pointer and denial projection together',async()=>{
 for(const fail of ['', 'INSERT INTO growth_connector_evidence_history', 'INSERT INTO growth_connector_health']){
  const f=trustFixture();type SQLState={hash:string;sequence:number;probe:SequencedConnectorProbe}|null;let rows:SQLState=null,snapshot:SQLState=null;let commits=0,rollbacks=0;const queries:string[]=[];
  const pool={getConnection:async()=>({beginTransaction:async()=>{snapshot=structuredClone(rows);},commit:async()=>{commits++;},rollback:async()=>{rows=snapshot;rollbacks++;},release:()=>{},execute:async(sql:string,params:unknown[]=[])=>{
   queries.push(sql);if(fail&&sql.includes(fail))throw Error('SYNTHETIC_SQL_FAILURE');let result:unknown=[];
   if(sql.includes('JOIN growth_connector_evidence_history'))result=rows?[{sequence:rows.sequence,payload_hash:rows.hash,probe_json:JSON.stringify(rows.probe)}]:[];
   else if(sql.includes('FROM growth_organization_budgets'))result=[{organization_id:'org1'}];
   else if(sql.includes('FROM growth_websites'))result=[{id:'site1'}];
   else if(sql.includes('FROM growth_publication_destinations'))result=[{revision:f.bridge.destination.revision,target:f.bridge.destination.target,enabled:1}];
   else if(sql.includes('FROM growth_connector_issuer_state'))result=[{revision:f.issuer.trustRevision,generation:1,revoked:0}];
   else if(sql.includes('FROM growth_connector_attestations')||sql.includes('FROM growth_connector_evidence_history'))result=[];
   else if(sql.startsWith('INSERT INTO growth_connector_evidence_history')){const probe=JSON.parse(String(params[10]));rows={hash:String(params[9]),sequence:Number(params[7]),probe};result={affectedRows:1};}
   else if(sql.startsWith('INSERT INTO growth_connector_attestations')||sql.startsWith('INSERT INTO growth_connector_health'))result={affectedRows:1};
   else throw Error('UNEXPECTED_SQL');return [result,[]];
  }})} as unknown as Pool;
  const repository=new MySQLConnectorEvidenceStore(pool),service=new ConnectorTrustService([f.issuer],f.anchor,repository);
  if(fail){await assert.rejects(()=>service.ingest(f.probe(),f.bridge.destination,now),/SYNTHETIC_SQL_FAILURE/);assert.equal(rows,null);assert.equal(commits,0);assert.equal(rollbacks,1);assert.ok(f.anchorState().pending);}
  else{await service.ingest(f.probe(),f.bridge.destination,now);assert.equal(commits,1);assert.equal((await repository.readCurrent(connectorTrustKey(f.issuer)))?.sequence,1);}
  assert.equal(queries.some(q=>/^(INSERT|UPDATE|DELETE).*growth_(content_authorizations|publication_claims|ai_reservations|websites)\b/.test(q)),false);
 }
});
test('probe ingestion snapshots signed input before waiting for the independent lease',async()=>{
 const f=trustFixture(),p=f.probe();const pending=f.service.ingest(p,f.bridge.destination,now);p.sequence=99;
 await pending;assert.equal(f.anchorState().sequence,1);assert.equal(f.saved()?.probe.attestation.evidence.eventId,'probe1');
});

test('execution guard rechecks the current boundary time rather than the issuance snapshot time',async()=>{
 const {record,bridge}=records(),db=contentSQLFixture(record,now),times:number[]=[];
 const boundary=new MySQLPublicationAuthorization(new ConnectorEvidenceVerifier([bridge.issuer]),{assertCurrent:async()=>{}},{check:async(_c,_a,at)=>{times.push(at);}});
 const c=await db.pool.getConnection();await c.beginTransaction();
 try{const receipt=await boundary.authorize(c,{organizationId:'org1',websiteId:'site1',contentId:'content1',channel:'site',reservationId:'reservation1',idempotencyKey:'publish:org1:site1:content1:site',authorization:bridge.request},record,{globalPaused:false,siteActive:true,websiteVerified:true,automationEnabled:true,publishingEnabled:true,contentPublishingEnabled:true},now);
 await receipt.recheck(now+1000);assert.deepEqual(times,[now,now+1000]);}finally{await c.rollback();c.release();}
});
