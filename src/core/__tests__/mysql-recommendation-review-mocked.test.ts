import test from 'node:test';import assert from 'node:assert/strict';
import type { Pool, PoolConnection } from 'mysql2/promise';
import { MySQLRecommendationReviewStore } from '../../server/mysql-recommendation-review';
import { reviewRecommendation, type ReviewAuthority } from '../offline-recommendation-review';

const org='00000000-0000-4000-8000-000000000001',site='00000000-0000-4000-8000-000000000002';
const id='00000000-0000-4000-8000-000000000003',actor='00000000-0000-4000-8000-000000000004',hash='a'.repeat(64);
const input={organizationId:org,websiteId:site,recommendationId:id,actorId:actor,role:'admin',
 evidenceHash:hash,expectedRevision:0,decision:'accept_for_planning' as const,reason:'Plan this improvement',
 idempotencyKey:'synthetic_decision_1'};
const authority:ReviewAuthority={assertCurrent:async()=>{},assertCurrentBudgetAndSwitches:async()=>{},currentTime:async()=> '2026-10-25T00:00:00Z'};
function fixture(commitUnknown=false,failInsert=false,revoked=false){
 const statements:string[]=[];let rollback=0,commits=0,connections=0;
 const connection={beginTransaction:async()=>{},commit:async()=>{commits++;if(commitUnknown)throw Error('SOCKET_CLOSED');},
  rollback:async()=>{rollback++;},release:()=>{},execute:async(sql:string,params:unknown[])=>{
    statements.push(sql);
    if(sql.startsWith('SELECT id,organization_id'))return [[{id,organization_id:org,website_id:site,evidence_hash:hash,
      expires_at:'2026-10-26T00:00:00.000000Z',evidence_revoked_at:revoked?'2026-10-25 00:00:00':null,revision:0,state:'proposed'}]];
    if(sql.startsWith('SELECT organization_id'))return [[]];
    if(sql.startsWith('INSERT')){if(failInsert)throw Error('INSERT_FAILED');return [{affectedRows:1}];}
    if(sql.startsWith('UPDATE')){assert.equal(params[2],org);assert.equal(params[3],site);return [{affectedRows:1}];}
    throw Error('UNEXPECTED_SQL');
  }} as unknown as PoolConnection;
 const pool={getConnection:async()=>{connections++;return connection;}} as Pick<Pool,'getConnection'>;
 return {store:new MySQLRecommendationReviewStore(pool),statements,get rollback(){return rollback;},
  get commits(){return commits;},get connections(){return connections;}};
}
test('candidate adapter uses one connection and event-before-CAS transaction ordering',async()=>{
 const x=fixture();const result=await reviewRecommendation(input,authority,x.store);
 assert.equal(result.revision,1);assert.equal(x.connections,1);assert.equal(x.commits,1);assert.equal(x.rollback,0);
 assert.deepEqual(x.statements.map(s=>s.split(' ')[0]),['SELECT','SELECT','INSERT','UPDATE']);
 assert.match(x.statements[0],/FOR UPDATE/);assert.match(x.statements[3],/organization_id=\? AND website_id=\?/);
});
test('definite insert failure rolls back, but uncertain COMMIT never retries or calls rollback',async()=>{
 const failed=fixture(false,true);
 await assert.rejects(reviewRecommendation(input,authority,failed.store),/INSERT_FAILED/);
 assert.equal(failed.rollback,1);assert.equal(failed.commits,0);
 const unknown=fixture(true);
 await assert.rejects(reviewRecommendation(input,authority,unknown.store),/REVIEW_COMMIT_UNKNOWN_OPERATOR_HOLD/);
 assert.equal(unknown.connections,1);assert.equal(unknown.rollback,0);assert.equal(unknown.commits,1);
});
test('revoked evidence and unavailable clock refuse without event write',async()=>{
 const revoked=fixture(false,false,true);
 await assert.rejects(reviewRecommendation(input,authority,revoked.store),/REVIEW_EVIDENCE_STALE/);
 assert.equal(revoked.statements.length,1);assert.equal(revoked.rollback,1);
 const clock=fixture();
 await assert.rejects(reviewRecommendation(input,{...authority,currentTime:async()=> 'unknown'},clock.store),/REVIEW_CLOCK_UNAVAILABLE/);
 assert.equal(clock.statements.length,1);assert.equal(clock.rollback,1);
});
