import test from 'node:test';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import type {Pool,PoolConnection} from 'mysql2/promise';
import {createPublicationJob} from '../safe-publication-jobs';import type {ContentRecord} from '../content-lifecycle';
import {PublicationAtomicCoordinator} from '../publication-atomic-integration';
import {MySQLAtomicPublicationRepository} from '../../server/mysql-atomic-publication-transaction';
import {MySQLPublicationSqlParticipants} from '../../server/mysql-publication-sql-participant';
import type {MySQLPublicationAuthorization} from '../../server/mysql-publication-authorization';
const now=Date.parse('2026-10-20T01:00:00Z'),at=new Date(now).toISOString();
const record:ContentRecord={organizationId:'org1',websiteId:'site1',id:'content1',contentType:'article',stage:'scheduled',version:5,eventIds:['e1','e2','e3','e4','e5'],sources:[],draft:'Synthetic draft',quality:{factual:true,original:true,rightsCleared:true,disclosureChecked:true,ymylReviewed:false,notes:'fixture'},approval:{actorId:'owner1',at},schedule:{channel:'wordpress',at}};
const job=createPublicationJob(record,{id:'job1',destination:{id:'dest1',revision:'rev1',target:'https://wordpress.invalid/'}}),ctx={organizationId:'org1',sessionHash:'a'.repeat(64)};
const auth={schemaVersion:1,id:'auth1',organizationId:'org1',websiteId:'site1',contentId:'content1',contentVersion:5,contentHash:job.contentHash,channel:'wordpress',destinationId:'dest1',destinationRevision:'rev1',destinationTarget:job.destination.target,reservationId:'generation1',approvalDecisionId:'e4',decision:'approved',purpose:'content_publication',approverId:'owner1',approvedAt:at,issuedAt:at,expiresAt:new Date(now+60000).toISOString(),policyHash:'f'.repeat(64)};
function fixture(){
 const events:string[]=[],state={disabled:false,stale:false,fail:'',claims:new Set<string>(),commits:0,rollbacks:0,leases:0,actorRevoked:false};
 const row={content_id:'content1',channel:'wordpress',content_version:5,content_hash:job.contentHash,destination_id:'dest1',destination_revision:'rev1',destination_target_hash:createHash('sha256').update(job.destination.target).digest('hex'),version:0,state:'scheduled',job_json:JSON.stringify(job),authorization_id:null,claim_hash:null,publication_reservation_id:null};
 const pool={getConnection:async()=>{
  const staged:string[]=[];
  const c={beginTransaction:async()=>{events.push('BEGIN');},commit:async()=>{events.push('COMMIT');if(state.fail==='COMMIT')throw Error('LOST_COMMIT');state.commits++;},rollback:async()=>{events.push('ROLLBACK');state.rollbacks++;for(const key of staged)state.claims.delete(key);},release:()=>events.push('RELEASE'),execute:async(sql:string,p:unknown[])=>{
   events.push(sql);
   if(state.fail&&sql.includes(state.fail))throw Error('INJECTED_FAILURE');
   if(sql.startsWith('INSERT')||sql.startsWith('UPDATE')){
    if(sql.includes('INSERT INTO growth_publication_claims')){const key=String(p[4]);if(state.claims.has(key))throw Error('DUPLICATE_CLAIM');state.claims.add(key);staged.push(key);}
    return [{affectedRows:1},[]];
   }
   if(sql.includes('growth_organization_budgets'))return [[{globally_paused:state.disabled?1:0,monthly_limit_minor:1000}],[]];
   if(sql.includes('FROM growth_websites'))return [[{status:'active',verified_at:new Date(now),automation_enabled:1,auto_publish_enabled:1}],[]];
   if(sql.includes('FROM growth_publication_jobs'))return [[{...row,content_hash:state.stale?'0'.repeat(64):row.content_hash}],[]];
   if(sql.includes('FROM growth_content_records'))return [[{version:5,record_json:JSON.stringify(record)}],[]];
   if(sql.includes('FROM growth_content_authorizations'))return [[{id:'auth1',authorization_json:JSON.stringify(auth),reservation_id:'generation1',approval_event_id:'e4'}],[]];
   if(sql.includes('FROM growth_content_policies'))return [[{enabled:1,auto_publish:1}],[]];
   if(sql.includes('FROM growth_publication_policy_revisions'))return [[{revision:'revpolicy1',feature_enabled:1}],[]];
   if(sql.includes('FROM growth_quota_reservations_v2')&&sql.includes('state=\'reserved\''))return [[{id:'fund1'}],[]];
   if(sql.includes('FROM growth_quota_reservations_v2'))return [[{id:'fund1',content_id:'content1',operation:'publication',state:'reserved',version:0,reserved_units:1,charged_units:0,charged_minor:0,refunded_minor:0,started_at:null,expires_at:new Date(now+60000)}],[]];
   if(sql.includes('FROM growth_publication_authorization_uses'))return [[{authorization_id:'auth1'}],[]];
   if(sql.includes('FROM growth_sessions'))return [[{user_id:'owner1',expires_at:new Date(now+60000),revoked_at:state.actorRevoked?new Date(now):null,disabled:0,role:'owner'}],[]];
   if(sql.includes('FROM growth_memberships'))return [[{role:'owner',disabled:0}],[]];
   throw Error('UNEXPECTED_SQL '+sql);
  }};
  return c as unknown as PoolConnection;
 }} as unknown as Pool;
 const verifier={authorize:async()=>({authorization:auth,requestorId:'owner1',connectorHash:'e'.repeat(64),checkedAt:now,expiresAt:now+60000,recheck:async()=>{if(state.actorRevoked)throw Error('REVOKED_CONNECTOR');}}),consume:async()=>{events.push('CONSUME_AUTH');}} as unknown as MySQLPublicationAuthorization;
 const authority={capability:'publication-atomic-authorities-v1' as const,assertPinnedSchema:async()=>{events.push('SCHEMA_PIN');},verifyBudget:async()=>{events.push('BUDGET');},recheckBudget:async()=>{events.push('BUDGET_RECHECK');},independentWitness:async()=>({generation:1,leaseId:'synthetic_lease1'})};
 const participant=new MySQLPublicationSqlParticipants(pool,verifier,authority),repository=new MySQLAtomicPublicationRepository(pool,participant);
 const coordinator=new PublicationAtomicCoordinator({acquire:async()=>{state.leases++;return {assertCurrent:async()=>{if(state.actorRevoked)throw Error('STALE_FENCE');},release:async()=>{state.leases--;}};}},repository,()=>now);
 return {coordinator,state,events};
}
test('mock SQL executes claim, quota start, authorization, binding, content CAS and job journal on one connection',async()=>{
 const f=fixture(),claim=await f.coordinator.claim(job,ctx);assert.equal(claim.reservationId,'generation1');assert.equal(f.state.commits,1);assert.equal(f.state.rollbacks,0);assert.equal(f.state.leases,0);
 for(const table of ['growth_publication_claims','growth_quota_events_v2','growth_publication_funding_bindings','growth_content_events','growth_publication_jobs','growth_publication_job_events'])assert.ok(f.events.some(e=>e.includes(table)),table);
 assert.ok(f.events.indexOf('BUDGET')<f.events.findIndex(e=>e.includes('INSERT INTO growth_publication_claims')));
});
test('binding failure rolls back claim and quota start; duplicate claim never double funds',async()=>{
 const f=fixture();f.state.fail='INSERT INTO growth_publication_funding_bindings';await assert.rejects(()=>f.coordinator.claim(job,ctx),/INJECTED_FAILURE/);
 assert.equal(f.state.commits,0);assert.equal(f.state.rollbacks,1);assert.equal(f.state.claims.size,0);assert.equal(f.state.leases,0);
 f.state.fail='';await f.coordinator.claim(job,ctx);await assert.rejects(()=>f.coordinator.claim(job,ctx),/DUPLICATE_CLAIM/);assert.equal(f.state.commits,1);
});
test('mock contention admits one claim and one funding start',async()=>{
 const f=fixture(),results=await Promise.allSettled(Array.from({length:8},()=>f.coordinator.claim(job,ctx)));
 assert.equal(results.filter(x=>x.status==='fulfilled').length,1);
 assert.equal(f.state.commits,1);assert.equal(f.events.filter(x=>x.includes('INSERT INTO growth_quota_events_v2')).length,1);
 assert.equal(f.state.leases,0);
});
test('disabled site, stale content, wrong tenant and revoked independent fence refuse before commit',async()=>{
 for(const mode of ['disabled','stale','revoked'] as const){const f=fixture();if(mode==='disabled')f.state.disabled=true;if(mode==='stale')f.state.stale=true;if(mode==='revoked')f.state.actorRevoked=true;await assert.rejects(()=>f.coordinator.claim(job,ctx));assert.equal(f.state.commits,0);}
 const f=fixture();await assert.rejects(()=>f.coordinator.claim(job,{...ctx,organizationId:'other'}),/PUBLICATION_INTENT_DENIED/);assert.equal(f.events.length,0);
});
test('lost COMMIT produces operator hold and no second claim attempt',async()=>{
 const f=fixture();f.state.fail='COMMIT';await assert.rejects(()=>f.coordinator.claim(job,ctx),/PUBLICATION_COMMIT_INDETERMINATE_INDETERMINATE_OPERATOR_HOLD/);
 assert.equal(f.events.filter(x=>x.includes('INSERT INTO growth_publication_claims')).length,1);assert.equal(f.state.rollbacks,0);assert.equal(f.state.leases,0);
});
