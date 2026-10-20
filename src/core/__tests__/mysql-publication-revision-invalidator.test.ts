import test from 'node:test';import assert from 'node:assert/strict';
import type {PoolConnection} from 'mysql2/promise';import {createPublicationJob} from '../safe-publication-jobs';import type {ContentRecord} from '../content-lifecycle';
import {MySQLPublicationRevisionInvalidator} from '../../server/mysql-publication-revision-invalidator';
const at='2026-10-20T01:00:00.000Z',scope={organizationId:'org1',websiteId:'site1',contentId:'content1'};
const record:ContentRecord={...scope,id:'content1',contentType:'article',stage:'scheduled',version:5,eventIds:['a','b','c','d','e'],sources:[],quality:{factual:true,original:true,rightsCleared:true,disclosureChecked:true,ymylReviewed:false,notes:'synthetic'},approval:{actorId:'owner1',at},schedule:{channel:'wordpress',at}};
const job=createPublicationJob(record,{id:'job1',destination:{id:'dest1',revision:'rev1',target:'https://wordpress.invalid/'}});
function fixture(){
 const state={claimed:false,ambiguous:false,consumed:false,wrongSite:false,fail:'',release:true,queries:[] as {sql:string;args:unknown[]}[]};
 const c={execute:async(sql:string,args:unknown[])=>{state.queries.push({sql,args});if(state.fail&&sql.includes(state.fail))throw Error('INJECTED_FAILURE');
  if(sql.startsWith('UPDATE')||sql.startsWith('INSERT'))return [{affectedRows:1},[]];
  if(sql.includes('growth_publication_claims'))return [state.claimed?[{channel:'wordpress'}]:[],[]];
  if(sql.includes('growth_publication_funding_bindings'))return [[],[]];
  if(sql.includes('growth_publication_jobs'))return [[{id:'job1',version:0,state:state.ambiguous?'awaiting_status':'scheduled',content_version:5,claim_hash:null,job_json:JSON.stringify(job)}],[]];
  if(sql.includes('growth_quota_reservations_v2'))return [[{id:'fund1',version:0,state:state.ambiguous?'executing':'reserved',charged_units:0,charged_minor:0,started_at:null}],[]];
  if(sql.includes('growth_content_authorizations'))return [[{id:'auth1',content_version:5,authorization_json:'{}',consumed_at:state.consumed?new Date(at):null,revoked_at:null}],[]];
  throw Error('UNEXPECTED_SQL');}} as unknown as PoolConnection;
 const invalidator=new MySQLPublicationRevisionInvalidator({capability:'publication-revision-authorities-v1',currentActor:async()=> 'owner1',verifyRelease:async()=>{if(!state.release)throw Error('RELEASE_DENIED');return {authorizationRevision:'rev1',policyRevision:'policy1',expiresAt:new Date(Date.parse(at)+60000).toISOString()};}});
 return {state,c,invalidator};
}
test('scheduled revision cancels job, unused publication funding and authorization in caller connection with journals',async()=>{
 const f=fixture();await f.invalidator.invalidate(f.c,scope,5,'revision1',at);
 for(const table of ['growth_publication_jobs','growth_publication_job_events','growth_quota_reservations_v2','growth_quota_events_v2','growth_content_authorizations','growth_publication_authorization_events'])assert.ok(f.state.queries.some(q=>q.sql.startsWith('UPDATE')||q.sql.startsWith('INSERT')?q.sql.includes(table):false),table);
 assert.ok(f.state.queries.every(q=>q.args[0]==='org1'||q.sql.startsWith('UPDATE')||q.sql.startsWith('INSERT')));
});
test('claimed, ambiguous, consumed or unreleasable work refuses without silent reset',async()=>{
 for(const mode of ['claimed','ambiguous','consumed','release'] as const){const f=fixture();if(mode==='release')f.state.release=false;else f.state[mode]=true;
  await assert.rejects(()=>f.invalidator.invalidate(f.c,scope,5,'revision1',at));
  if(mode!=='release')assert.equal(f.state.queries.some(q=>q.sql.startsWith('UPDATE')),false);
 }
});
test('cross-tenant malformed scope and failed journal stop transaction for caller rollback',async()=>{
 const f=fixture();await assert.rejects(()=>f.invalidator.invalidate(f.c,{...scope,organizationId:'org:other'},5,'revision1',at),/REVISION_SCOPE_DENIED/);assert.equal(f.state.queries.length,0);
 const g=fixture();g.state.fail='INSERT INTO growth_quota_events_v2';await assert.rejects(()=>g.invalidator.invalidate(g.c,scope,5,'revision1',at),/INJECTED_FAILURE/);
 // Caller owns rollback; a failed audit must never be committed.
 assert.equal(g.state.queries.some(q=>q.sql.includes('INSERT INTO growth_quota_events_v2')),true);
});
