import test from 'node:test';
import assert from 'node:assert/strict';
import type {Pool,PoolConnection} from 'mysql2/promise';
import {ContentFactory,createFactoryEnvelope,factoryReviewHash,factoryHash,type FactoryCommand,type ResearchSource,type FactoryQualityReport} from '../content-factory';
import {MySQLContentFactoryStore,decodeFactoryEnvelope,type FactoryDurableAuthorities} from '../../server/mysql-content-factory-store';
import {MySQLContentStore} from '../../server/mysql-content-store';
import {MySQLPublicationClaimStore} from '../../server/mysql-publication-claim-store';
import {MySQLPublicationAuthorization} from '../../server/mysql-publication-authorization';
import {contentAuthorizationHash} from '../publication-authorization';
const time=Date.parse('2026-10-20T01:00:00Z'),at=(n=0)=>new Date(time+n).toISOString(),scope={organizationId:'org1',websiteId:'site1',contentId:'content1'},sessionHash='a'.repeat(64);
const source:ResearchSource={id:'s1',url:'https://source.invalid/',claim:'Synthetic claim',observedAt:at(-1000),expiresAt:at(300000),snapshotHash:'b'.repeat(64),verificationId:'verified1'};
function fixture(){
 const initial=createFactoryEnvelope({id:scope.contentId,organizationId:scope.organizationId,websiteId:scope.websiteId,contentType:'article'});
 const state={record:JSON.stringify(initial.record),version:0,events:[] as {id:string;json:string}[],commits:0,rollbacks:0,queries:[] as string[],revoked:false,enabled:true,policy:'policy1',invalidated:0,invalidatorFails:false,qualityHash:'',sqlFails:'',tail:Promise.resolve()};
 const authorities:FactoryDurableAuthorities={
  policy:async()=>({revision:state.policy,enabled:state.enabled,regulated:false,requiredDisclosures:[]}),
  evidence:async(_,kind,value)=>{if(state.revoked||(kind==='source'&&JSON.stringify(value)!==JSON.stringify(source))||(kind==='quality'&&factoryHash(value)!==state.qualityHash))throw Error('EVIDENCE_DENIED');},
  invalidate:async()=>{state.invalidated++;if(state.invalidatorFails)throw Error('INVALIDATION_DENIED');},
  currentApprover:async()=>{if(state.revoked)throw Error('APPROVER_REVOKED');}
 };
 const pool={getConnection:async()=>{
  const previous=state.tail;let release!:()=>void;state.tail=new Promise<void>(r=>release=r);await previous;
  let work={record:state.record,version:state.version,events:structuredClone(state.events)};
  const connection={beginTransaction:async()=>{},commit:async()=>{state.record=work.record;state.version=work.version;state.events=work.events;state.commits++;},rollback:async()=>{state.rollbacks++;},release:()=>release(),execute:async(sql:string,params:unknown[]=[])=>{
    state.queries.push(sql);if(state.sqlFails&&sql.includes(state.sqlFails))throw Error('SQL_INTERRUPTED');
    if(sql.includes('FROM growth_sessions'))return [[{user_id:'owner1',expires_at:new Date(time+600000),revoked_at:state.revoked?new Date(time):null,disabled:0,role:'owner'}],[]];
    if(sql.includes('FROM growth_organization_budgets'))return [[{globally_paused:0}],[]];
    if(sql.includes('FROM growth_websites'))return [[{id:'site1',status:'active',verified_at:new Date(time),automation_enabled:1,auto_publish_enabled:1}],[]];
    if(sql.includes('FROM growth_content_records'))return [params[0]===scope.organizationId&&params[1]===scope.websiteId&&params[2]===scope.contentId?[{version:work.version,record_json:work.record}]:[],[]];
    if(sql.startsWith('INSERT INTO growth_content_events')){if(work.events.some(e=>e.id===params[3]))throw Error('EVENT_DUPLICATE');work.events.push({id:String(params[3]),json:String(params[8])});return [{affectedRows:1},[]];}
    if(sql.startsWith('UPDATE growth_content_records')){if(params[3]!==scope.organizationId||params[4]!==scope.websiteId||params[5]!==scope.contentId||params[6]!==work.version)return [{affectedRows:0},[]];work.version=Number(params[0]);work.record=String(params[2]);return [{affectedRows:1},[]];}
    throw Error('UNEXPECTED_SQL:'+sql);
  }};
  return connection as unknown as PoolConnection;
 }} as unknown as Pool;
 const factory=new ContentFactory(new MySQLContentFactoryStore(pool,authorities,()=>time),()=>time);
 const command=(kind:FactoryCommand['body'],version=state.version,eventId='e'+(state.version+1))=>({websiteId:scope.websiteId,contentId:scope.contentId,expectedVersion:version,eventId,body:kind});
 return {factory,pool,state,authorities,command,run:(body:FactoryCommand['body'],version=state.version,eventId='e'+(state.version+1))=>factory.execute({organizationId:scope.organizationId,sessionHash},command(body,version,eventId)),read:()=>decodeFactoryEnvelope({version:state.version,record_json:state.record} as never,scope)};
}
test('candidate-010 adapter persists tenant-scoped CAS, metadata, append-only identity and brief/revision events in one transaction',async()=>{
 const f=fixture();await f.run({kind:'research',sources:[source]});await f.run({kind:'brief',brief:{topic:'Synthetic',audience:'Reviewers',objective:'Test',language:'en',requiredDisclosures:[],assetIds:['text1']}});
 await f.run({kind:'draft',text:'Synthetic draft with enough length for the contract.'});
 const before=f.read();await f.run({kind:'revise',text:'A revised synthetic draft with adequate length.',reason:'New facts'});
 assert.equal(f.state.invalidated,1);assert.equal(f.read().record.stage,'drafted');assert.equal(f.read().quality,null);
 assert.equal(f.state.events.length,4);assert.deepEqual(f.state.events.map(e=>JSON.parse(e.json).version),[1,2,3,4]);
 assert.equal(f.read().journal.length,4);assert.equal(before.record.version,3);
 assert.match(f.state.queries.join('\n'),/AND version=\?/);
 assert.ok(f.state.queries.filter(q=>q.includes('FOR UPDATE')).length>=4);
});
test('concurrent replay has one winner; tenant isolation and stale CAS never insert an event',async()=>{
 const f=fixture(),c=f.command({kind:'research',sources:[source]},0,'same');
 const results=await Promise.allSettled(Array.from({length:8},()=>f.factory.execute({organizationId:scope.organizationId,sessionHash},c)));
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(f.state.events.length,1);assert.equal(f.state.commits,1);
 await assert.rejects(()=>f.factory.execute({organizationId:'other',sessionHash},f.command({kind:'brief',brief:{topic:'Topic',audience:'Users',objective:'Test',language:'en',requiredDisclosures:[],assetIds:['asset1']}})));
 await assert.rejects(()=>f.run({kind:'research',sources:[source]},0,'different'),/VERSION_CONFLICT|RESEARCH_STATE/);
 assert.equal(f.state.events.length,1);
});
test('quality and human approval persist review digest; revision atomically removes authorization basis',async()=>{
 const f=fixture();await f.run({kind:'research',sources:[source]});await f.run({kind:'brief',brief:{topic:'Topic',audience:'Users',objective:'Test',language:'en',requiredDisclosures:[],assetIds:['asset1']}});await f.run({kind:'draft',text:'Synthetic draft with sufficient reviewable content.'});
 const digest=factoryReviewHash(f.read());
 const q:FactoryQualityReport={id:'qa1',issuer:'synthetic_qa',reviewedHash:digest,checkedAt:at(-1000),expiresAt:at(300000),factual:[{sourceId:'s1',claimHash:factoryHash(source.claim),result:'pass'}],originality:{result:'pass',method:'synthetic',corpusHash:'c'.repeat(64),reportHash:'d'.repeat(64)},rights:[{assetId:'asset1',owner:'Fixture',license:'owned',proofHash:'e'.repeat(64),permittedUses:['publication'],attributionRequired:false,attribution:''}],disclosure:{checked:true,required:false,text:''},regulatedReview:null};
 f.state.qualityHash=factoryHash(q);await f.run({kind:'quality',report:q});await f.run({kind:'approve',reviewedHash:digest,qualityId:q.id,explicitHumanConsent:true});await f.run({kind:'schedule',channel:'wordpress',publishAt:at(600000),reviewedHash:digest});
 assert.equal(f.read().record.factoryReviewDigest,digest);assert.equal(f.read().record.stage,'scheduled');assert.equal(f.read().journal.length,6);
 const corrupted=JSON.parse(f.state.record);corrupted.factoryReviewDigest='0'.repeat(64);assert.throws(()=>decodeFactoryEnvelope({version:6,record_json:JSON.stringify(corrupted)} as never,scope),/FACTORY_APPROVAL_CORRUPT/);
 const approved=JSON.parse(f.state.events[4].json);assert.equal(approved._factory.journal.length,5);assert.equal(approved.stage,'approved');
 await f.run({kind:'revise',text:'A revised draft with different verified language.',reason:'Correction'});
 assert.equal(f.read().record.factoryReviewDigest,undefined);assert.equal(f.read().humanApproval,null);assert.equal(f.read().record.schedule,undefined);assert.equal(f.state.invalidated,1);
});
test('rollback on insert/update failure, invalidation failure and revocation leaves record/event unchanged',async()=>{
 for(const sql of ['INSERT INTO growth_content_events','UPDATE growth_content_records']){
  const f=fixture();f.state.sqlFails=sql;await assert.rejects(()=>f.run({kind:'research',sources:[source]}),/SQL_INTERRUPTED/);assert.equal(f.state.version,0);assert.equal(f.state.events.length,0);assert.equal(f.state.commits,0);
 }
 const f=fixture();await f.run({kind:'research',sources:[source]});await f.run({kind:'brief',brief:{topic:'Topic',audience:'Users',objective:'Test',language:'en',requiredDisclosures:[],assetIds:['asset1']}});await f.run({kind:'draft',text:'A synthetic initial draft with sufficient length.'});
 f.state.invalidatorFails=true;await assert.rejects(()=>f.run({kind:'revise',text:'Another valid draft with enough length here.',reason:'Correction'}),/INVALIDATION_DENIED/);assert.equal(f.state.events.length,3);
 f.state.revoked=true;await assert.rejects(()=>f.run({kind:'revise',text:'Another valid draft with enough length here.',reason:'Correction'}),/FACTORY_SESSION_DENIED/);assert.equal(f.state.events.length,3);
});
test('disabled or changed policy at the boundary refuses the factory write',async()=>{
 const f=fixture();f.state.enabled=false;await assert.rejects(()=>f.run({kind:'research',sources:[source]}),/FACTORY_POLICY_UNAVAILABLE/);assert.equal(f.state.commits,0);
 const g=fixture(),original=g.authorities.evidence;let checks=0;
 g.authorities.evidence=async(...args)=>{await original(...args);if(++checks===2)g.state.policy='policy2';};
 await assert.rejects(()=>g.run({kind:'research',sources:[source]}),/FACTORY_AUTHORIZATION_CHANGED/);assert.equal(g.state.events.length,0);assert.equal(g.state.commits,0);
});
test('malformed metadata, mismatched approval digest and legacy nonempty content fail closed',()=>{
 const f=fixture(),r=JSON.parse(f.state.record);
 for(const metadata of [{schemaVersion:1,brief:null,research:[],quality:null,humanApproval:null,journal:[{eventId:'x'}]},{schemaVersion:1,brief:null,research:[],quality:null,humanApproval:null,journal:[]}]){
  const next={...r,version:1,eventIds:['e1'],_factory:metadata};assert.throws(()=>decodeFactoryEnvelope({version:1,record_json:JSON.stringify(next)} as never,scope),/FACTORY_STORAGE_CORRUPT/);
 }
 assert.throws(()=>decodeFactoryEnvelope({version:1,record_json:JSON.stringify({...r,version:1,stage:'approved',eventIds:['e1']})} as never,scope),/FACTORY_LEGACY_CONTENT_UNSUPPORTED/);
 assert.throws(()=>decodeFactoryEnvelope({version:0,record_json:JSON.stringify({...r,organizationId:'other'})} as never,scope),/CONTENT_STORAGE_CORRUPT/);
});
test('legacy writer and publication claim path refuse factory-managed records before a provider/funding action',async()=>{
 const f=fixture();await f.run({kind:'research',sources:[source]});
 const evidence={actor:{userId:'owner1',organizationId:'org1',websiteId:'site1',role:'owner' as const},event:{kind:'draft' as const,eventId:'e2',at:at(),text:'A valid synthetic draft with enough characters.'}};
 await assert.rejects(()=>new MySQLContentStore(f.pool).update(scope.organizationId,scope.websiteId,scope.contentId,1,r=>({...r,version:2,eventIds:[...r.eventIds,'e2']}),evidence),/FACTORY_WRITER_REQUIRED/);
 const claim={organizationId:scope.organizationId,websiteId:scope.websiteId,contentId:scope.contentId,channel:'wordpress',idempotencyKey:'publish:org1:site1:content1:wordpress',reservationId:'reservation1'};
 await assert.rejects(()=>new MySQLPublicationAuthorization().authorize({} as never,claim as never,JSON.parse(f.state.record),{} as never,time),/FACTORY_PUBLICATION_ATOMIC_ADAPTER_REQUIRED/);
 await assert.rejects(()=>new MySQLPublicationClaimStore(f.pool).claimOnce(claim),/FACTORY_PUBLICATION_ATOMIC_ADAPTER_REQUIRED/);
 assert.equal(f.state.events.length,1);assert.equal(f.state.commits,1);
 assert.notEqual(contentAuthorizationHash(f.read().record),contentAuthorizationHash(JSON.parse(f.state.record)));
});
