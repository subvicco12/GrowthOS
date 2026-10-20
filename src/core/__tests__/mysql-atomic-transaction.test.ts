import test from 'node:test';
import assert from 'node:assert/strict';
import type {Pool,PoolConnection} from 'mysql2/promise';
import type {AtomicPublicationTransaction,IndependentPublicationFence} from '../publication-atomic-integration';
import {MySQLAtomicPublicationRepository,type CertifiedAtomicParticipants} from '../../server/mysql-atomic-publication-transaction';
const scope={organizationId:'org1',websiteId:'site1',contentId:'content1'},jobId='job1';
const operations=['lockScope','loadContent','authorize','checkPublicationFunding','insertClaim','startFunding','consumeAuthorization','insertFundingBinding','contentUnknown','appendAudit','saveUnknownJob','checkCommitBoundary'] as const;
function fixture(){
 const events:string[]=[],state={failAt:'',fenceValid:true};
 const connection={beginTransaction:async()=>{events.push('begin');},commit:async()=>{events.push('commit');if(state.failAt==='commit')throw Error('SOCKET_LOST');},rollback:async()=>{events.push('rollback');},release:()=>events.push('release')} as unknown as PoolConnection;
 const pool={getConnection:async()=>connection} as unknown as Pool;
 const fence:IndependentPublicationFence={assertCurrent:async()=>{events.push('fence');if(!state.fenceValid)throw Error('STALE_FENCE');},release:async()=>{events.push('fence_release');}};
 const participants:CertifiedAtomicParticipants={capability:'certified-010-013-atomic-participants',assertCompatible:async(c)=>{assert.equal(c,connection);events.push('schema');if(state.failAt==='schema')throw Error('SCHEMA_UNAVAILABLE');},open:(c,s,id,f)=>{
  assert.equal(c,connection);assert.deepEqual(s,scope);assert.equal(id,jobId);assert.equal(f,fence);
  return Object.fromEntries(operations.map(name=>[name,async()=>{events.push(name);if(state.failAt===name)throw Error('STEP_FAILED');}])) as unknown as AtomicPublicationTransaction;
 },readCommittedIdentity:async()=>{events.push('readback');return 'indeterminate';}};
 const repository=new MySQLAtomicPublicationRepository(pool,participants);
 const work=async(tx:AtomicPublicationTransaction)=>{for(const name of operations)await (tx[name] as (...args:unknown[])=>Promise<unknown>)();return 'local_result';};
 return {repository,events,state,fence,work};
}
test('all participants share one transaction; independent fence survives through commit',async()=>{
 const f=fixture();assert.equal(await f.repository.transaction(scope,jobId,f.fence,f.work),'local_result');
 assert.deepEqual(f.events,['schema','fence','begin',...operations,'fence','commit','release']);
});
test('missing, failed and out-of-order stages refuse and rollback without commit',async()=>{
 for(const step of ['schema','startFunding','insertFundingBinding','checkCommitBoundary']){
  const f=fixture();f.state.failAt=step;await assert.rejects(()=>f.repository.transaction(scope,jobId,f.fence,f.work));
  assert.ok(!f.events.includes('commit'));assert.equal(f.events.includes('rollback'),step!=='schema');assert.equal(f.events.at(-1),'release');
 }
 const f=fixture();await assert.rejects(()=>f.repository.transaction(scope,jobId,f.fence,async tx=>{await tx.loadContent({} as never);}),/OPERATION_ORDER/);
 assert.ok(f.events.includes('rollback'));assert.ok(!f.events.includes('commit'));
});
test('lease loss before commit rolls back, and unknown commit is never treated as absent',async()=>{
 const f=fixture();const normal=f.work;f.work=async tx=>{const value=await normal(tx);f.state.fenceValid=false;return value;};
 await assert.rejects(()=>f.repository.transaction(scope,jobId,f.fence,f.work),/STALE_FENCE/);
 assert.ok(f.events.includes('rollback'));assert.ok(!f.events.includes('commit'));
 const g=fixture();g.state.failAt='commit';await assert.rejects(()=>g.repository.transaction(scope,jobId,g.fence,g.work),e=>{
  assert.equal((e as {code?:string}).code,'PUBLICATION_COMMIT_INDETERMINATE');return true;});
 assert.equal(g.events.filter(x=>x==='commit').length,1);assert.equal(g.events.includes('rollback'),false);
 assert.equal(await g.repository.readCommittedIdentity(scope,jobId),'indeterminate');
});
test('construction and scope refuse missing trust participant or cross-tenant malformed identifiers',async()=>{
 assert.throws(()=>new MySQLAtomicPublicationRepository({getConnection:async()=>{throw Error('UNEXPECTED_CONNECTION');}} as never,{} as never),/PARTICIPANTS_REQUIRED/);
 const f=fixture();await assert.rejects(()=>f.repository.transaction({...scope,organizationId:'wrong:tenant'},jobId,f.fence,f.work),/SCOPE_OR_FENCE/);assert.equal(f.events.length,0);
 await assert.rejects(()=>f.repository.readCommittedIdentity(scope,'../job'),/READBACK_SCOPE/);
});
