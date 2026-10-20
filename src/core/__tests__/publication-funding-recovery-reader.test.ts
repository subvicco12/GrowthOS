import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import type {Pool} from 'mysql2/promise';
import {createPublicationJob} from '../safe-publication-jobs';
import {publicationClaimHash} from '../../server/publication-evidence';
import {MySQLPublicationJobRecoveryReader} from '../../server/mysql-publication-job-recovery-reader';
import type {ContentRecord} from '../content-lifecycle';
const at='2026-10-20T01:00:00.000Z',scope={organizationId:'org1',websiteId:'site1',contentId:'content1'};
const record:ContentRecord={...scope,id:'content1',contentType:'blog',stage:'scheduled',version:5,eventIds:['a','b','c','d','e'],sources:[],quality:{factual:true,original:true,rightsCleared:true,disclosureChecked:true,ymylReviewed:false,notes:'synthetic'},approval:{actorId:'owner1',at},schedule:{channel:'wordpress',at}};
const base=createPublicationJob(record,{id:'job1',destination:{id:'dest1',revision:'rev1',target:'https://wordpress.invalid/'}});
const claim={organizationId:'org1',websiteId:'site1',contentId:'content1',channel:'wordpress',idempotencyKey:'publish:org1:site1:content1:wordpress',reservationId:'generation1'};
function fixture(claimed=true){
 const job=claimed?{...base,state:'awaiting_status' as const,version:1,claim,nextProbeAt:at,journal:[{eventId:'event1',payloadHash:'a'.repeat(64),operation:'claim',at}]}:base;
 const row={version:job.version,state:job.state,job_json:JSON.stringify(job),content_version:job.contentVersion,content_hash:job.contentHash,channel:job.channel,destination_id:job.destination.id,destination_revision:job.destination.revision,destination_target_hash:createHash('sha256').update(job.destination.target).digest('hex'),not_before:new Date(job.notBefore),authorization_id:claimed?'auth1':null,claim_hash:claimed?publicationClaimHash(claim):null,publication_reservation_id:claimed?'fund1':null,probe_attempts:job.probeAttempts,next_probe_at:claimed?new Date(at):null,witness_generation:claimed?1:null,witness_lease_id:claimed?'synthetic_lease1':null};
 const event={event_id:'event1',resulting_version:1,operation:'claim',occurred_at:new Date(at),payload_hash:'a'.repeat(64),observation_issuer:null,observation_event_id:null,observation_hash:null};
 const binding={authorization_id:'auth1',claim_hash:publicationClaimHash(claim),generation_reservation_id:'generation1',publication_reservation_id:'fund1',content_version:5,content_hash:job.contentHash,destination_id:'dest1',publication_operation:'publication'};
 const funding={id:'fund1',content_id:'content1',operation:'publication',state:'executing'};
 const state={row,event,binding,funding,queries:[] as {sql:string;params:unknown[]}[],released:0};
 const pool={getConnection:async()=>({release:()=>{state.released++;},execute:async(sql:string,params:unknown[])=>{
  state.queries.push({sql,params});if(sql.includes('FROM growth_publication_jobs'))return [[state.row],[]];
  if(sql.includes('FROM growth_publication_job_events'))return [claimed?[state.event]:[],[]];
  if(sql.includes('FROM growth_publication_funding_bindings'))return [[state.binding],[]];
  if(sql.includes('FROM growth_quota_reservations_v2'))return [[state.funding],[]];
  throw Error('UNEXPECTED_SQL');
 }})} as unknown as Pool;
 return {state,reader:new MySQLPublicationJobRecoveryReader(pool)};
}
test('read-only snapshot binds distinct legacy and v2 funding identities, scoped event history and no publication authority',async()=>{
 const f=fixture(),s=await f.reader.inspect(scope,'job1');assert.equal(s.generationReservationId,'generation1');assert.equal(s.publicationFundingId,'fund1');assert.equal(s.publicationAuthorized,false);
 assert.equal(f.state.queries.length,4);assert.ok(f.state.queries.every(q=>q.sql.startsWith('SELECT')&&q.sql.includes('organization_id=?')&&q.sql.includes('website_id=?')&&q.params[0]==='org1'&&q.params[1]==='site1'));
 assert.equal(f.state.released,1);
 const unclaimed=fixture(false),v=await unclaimed.reader.inspect(scope,'job1');assert.equal(v.publicationFundingId,null);assert.equal(v.publicationAuthorized,false);assert.equal(unclaimed.state.queries.length,2);
});
test('cross-tenant scope, missing journal, stale hash, wrong funding and replayed identity refuse',async()=>{
 for(const mode of ['tenant','journal','contentHash','binding','funding','claim','destination','witness'] as const){
  const f=fixture();if(mode==='tenant')f.state.row.job_json=JSON.stringify({...JSON.parse(f.state.row.job_json),organizationId:'other'});
  if(mode==='journal')f.state.event.resulting_version=2;
  if(mode==='contentHash')f.state.row.content_hash='0'.repeat(64);
  if(mode==='binding')f.state.binding.generation_reservation_id='other';
  if(mode==='funding')f.state.funding.operation='generation';
  if(mode==='claim')f.state.row.claim_hash='0'.repeat(64);
  if(mode==='destination')f.state.row.destination_target_hash='0'.repeat(64);
  if(mode==='witness')f.state.row.witness_generation=null;
  await assert.rejects(()=>f.reader.inspect(scope,'job1'));
  assert.equal(f.state.released,1);
 }
 const f=fixture();await assert.rejects(()=>f.reader.inspect({...scope,organizationId:'other'},'job1'));
});
test('forged terminal success without signed observation reference and missing witness are not recoverable',async()=>{
 const terminal=fixture();terminal.state.row.state='confirmed';terminal.state.row.job_json=JSON.stringify({...JSON.parse(terminal.state.row.job_json),state:'confirmed',nextProbeAt:null});terminal.state.row.next_probe_at=null;
 await assert.rejects(()=>terminal.reader.inspect(scope,'job1'),/TERMINAL_EVIDENCE_MISSING/);
 const f=fixture();f.state.row.witness_lease_id=null;await assert.rejects(()=>f.reader.inspect(scope,'job1'),/CLAIM_MISMATCH/);
});
