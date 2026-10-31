import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { encodeOperationCursor,decodeOperationCursor,retryBackoffMs } from '../isolated-operations';
import { encryptConnectorKey,decryptConnectorKey,validateSyntheticConnectorEndpoint,signSyntheticHealth,verifySyntheticHealth,localSyntheticHealthAdapter,type SyntheticHealthPayload } from '../../server/synthetic-connector-security';
import { runIsolatedWorkerLoop } from '../../server/isolated-worker-loop';
import { createOperationsHandlers,assertSession03Runtime } from '../../server/isolated-operations-http';
import type { MySQLIsolatedOperations } from '../../server/mysql-isolated-operations';
import { createRequire } from 'node:module';
const org=randomUUID(),website=randomUUID(),actor=randomUUID(),scope={organizationId:org,websiteId:website,actorId:actor};
const master='a'.repeat(64);
process.env.GROWTHOS_APP_ORIGIN='https://growthos.example';
test('credentials encrypt with randomized authenticated tenant/endpoint binding and never return plaintext',()=>{
 const one=encryptConnectorKey('server-only-secret',master,'tenant|site|epoch1'),two=encryptConnectorKey('server-only-secret',master,'tenant|site|epoch1');
 assert.notEqual(one,two);assert.equal(one.includes('server-only-secret'),false);assert.equal(decryptConnectorKey(one,master,'tenant|site|epoch1'),'server-only-secret');
 assert.throws(()=>decryptConnectorKey(one,master,'other-tenant|site|epoch1'));assert.throws(()=>decryptConnectorKey(one,'b'.repeat(64),'tenant|site|epoch1'));assert.throws(()=>decryptConnectorKey(one+'ff',master,'tenant|site|epoch1'));assert.throws(()=>encryptConnectorKey('secret','bad','binding'),/CONNECTOR_KEY_UNAVAILABLE/);
});
test('synthetic connector configuration refuses arbitrary destinations, credentials, ports and rebinding inputs',()=>{
 validateSyntheticConnectorEndpoint('owned.example.org','https://owned.example.org/wp-json/growthos/v1/health');
 for(const endpoint of ['http://owned.example.org/wp-json/growthos/v1/health','https://127.0.0.1/wp-json/growthos/v1/health','https://owned.example.org:444/wp-json/growthos/v1/health','https://user:pass@owned.example.org/wp-json/growthos/v1/health','https://owned.example.org/wp-json/growthos/v1/health?target=localhost','https://owned.example.org/wp-json/growthos/v1/health#x','https://owned.example.org/redirect'])assert.throws(()=>validateSyntheticConnectorEndpoint('owned.example.org',endpoint));
 for(const domain of ['localhost','127.0.0.1','169.254.169.254','service.internal','service.local'])assert.throws(()=>validateSyntheticConnectorEndpoint(domain,`https://${domain}/wp-json/growthos/v1/health`));
});
test('authenticated read-only synthetic health binds nonce, website, endpoint and capability set',async()=>{
 const payload:SyntheticHealthPayload={connectorId:randomUUID(),websiteId:website,endpoint:'https://owned.example.org/wp-json/growthos/v1/health',nonce:randomUUID(),observedAt:new Date().toISOString(),status:'ok',mode:'synthetic',capabilities:['read_only']};
 const signature=signSyntheticHealth(payload,'secret');const response=await localSyntheticHealthAdapter.read(payload,signature,'secret');verifySyntheticHealth(response.payload,response.signature,payload,'secret');
 assert.throws(()=>verifySyntheticHealth({...payload,nonce:randomUUID()},signature,payload,'secret'));assert.throws(()=>verifySyntheticHealth({...payload,capabilities:['read_only','publish']},signature,payload,'secret'));assert.throws(()=>verifySyntheticHealth(payload,'f'.repeat(64),payload,'secret'));
 await assert.rejects(localSyntheticHealthAdapter.read(payload,'bad','secret'));
});
test('microsecond keyset cursors bind tenant, website, stream and canonical encoding',()=>{
 const raw=encodeOperationCursor({organizationId:org,websiteId:website,stream:'jobs',at:'2026-10-31 01:02:03.123456',id:randomUUID()});assert.equal(decodeOperationCursor(raw,org,website,'jobs')?.stream,'jobs');
 for(const [tenant,site,stream] of [[randomUUID(),website,'jobs'],[org,randomUUID(),'jobs'],[org,website,'events']] as const)assert.throws(()=>decodeOperationCursor(raw,tenant,site,stream),/INVALID_CURSOR/);
 for(const value of ['!',raw+'=',Buffer.from('{}').toString('base64url')])assert.throws(()=>decodeOperationCursor(value,org,website,'jobs'),/INVALID_CURSOR/);
});
test('retry backoff and worker loops are bounded and honour cancellation before additional claims',async()=>{
 assert.deepEqual([1,2,3].map(retryBackoffMs),[5000,10000,20000]);for(const attempt of [0,4,1.5])assert.throws(()=>retryBackoffMs(attempt));
 const abort=new AbortController();let calls=0;const result=await runIsolatedWorkerLoop({tick:async()=>{calls++;abort.abort();return {processed:1};}},scope,{iterations:60,intervalMs:100,signal:abort.signal});assert.equal(calls,1);assert.equal(result.stopped,true);
 assert.equal((await runIsolatedWorkerLoop({tick:async()=>{throw Error('must not run');}},scope,{iterations:2,intervalMs:100,signal:abort.signal})).cycles,0);
 await assert.rejects(runIsolatedWorkerLoop({tick:async()=>({processed:0})},scope,{iterations:1000,intervalMs:100,signal:new AbortController().signal}));
});
test('Session 03 gate cannot enable contracts on remote/non-disposable databases',()=>{
 const env={GROWTHOS_SESSION02_DISPOSABLE:'YES',GROWTHOS_SESSION03_DISPOSABLE:'YES',GROWTHOS_TEST_DB_DISPOSABLE:'YES',GROWTHOS_DB_HOST:'127.0.0.1',GROWTHOS_DB_NAME:'growthos_test_unit'};assert.doesNotThrow(()=>assertSession03Runtime(env));
 for(const bad of [{GROWTHOS_SESSION03_DISPOSABLE:''},{GROWTHOS_DB_HOST:'production.example.org'},{GROWTHOS_DB_NAME:'production'}])assert.throws(()=>assertSession03Runtime({...env,...bad}));
});
function api(role='owner',gate:()=>void=()=>{}){let calls=0;const store={operations:async()=>{calls++;return {items:[],nextCursor:null};},tick:async()=>{calls++;return {processed:0};}} as unknown as MySQLIsolatedOperations;
 return {calls:()=>calls,...createOperationsHandlers(async()=>{if(role==='anonymous')throw Error('AUTHENTICATION_REQUIRED');return {userId:actor,organization:{id:org,role}};},()=>store,gate)};
}
const request=(body:unknown,headers:Record<string,string>={})=>new Request('https://growthos.example/api/isolated-operations',{method:'POST',headers:{origin:'https://growthos.example',host:'growthos.example',...headers},body:JSON.stringify(body)});
test('operations HTTP fails closed before DB, rejects cross-scope and non-admin mutations',async()=>{
 const disabled=api('owner',()=>{throw Error('ISOLATED_SCHEMA_REQUIRED');});assert.equal((await disabled.GET(new Request('https://growthos.example'))).status,501);assert.equal(disabled.calls(),0);
 const body={organizationId:org,websiteId:website,action:'tick'};
 for(const [role,status] of [['viewer',403],['editor',403],['anonymous',401]] as const){const a=api(role);assert.equal((await a.POST(request(body))).status,status);assert.equal(a.calls(),0);}
 const a=api();assert.equal((await a.POST(request({...body,organizationId:randomUUID()}))).status,403);assert.equal((await a.POST(request(body,{host:'evil.example'}))).status,403);assert.equal((await a.POST(request({...body,junk:'x'.repeat(5000)}))).status,413);assert.equal(a.calls(),0);
 const response=await a.POST(request(body));assert.equal(response.status,200);assert.equal((await response.json()).externalAction,false);assert.equal(response.headers.get('cache-control'),'no-store');
});
test('read operations validate stream/query and selected organization for viewers',async()=>{
 const a=api('viewer'),url=`https://growthos.example/api/isolated-operations?organizationId=${org}&websiteId=${website}&stream=jobs`;
 assert.equal((await a.GET(new Request(url))).status,200);assert.equal((await a.GET(new Request(url+'&stream=events'))).status,400);assert.equal((await a.GET(new Request(url.replace(org,randomUUID())))).status,403);
});
test('schema reconciliation inventories all candidates without executing SQL or merging distinct authority models',()=>{
 const {review}=createRequire(import.meta.url)('../../../scripts/review-development-schema.cjs');const result=review();
 assert.equal(result.mode,'STATIC_ONLY_NO_SQL_EXECUTED');assert.equal(result.nameCollisions.length,0);assert.equal(Object.keys(result.proposals).length,9);
 assert.ok(result.proposals['017'].tables.every((name:string)=>name.startsWith('growth_dev_')));assert.ok(result.proposals['018'].references.includes('growth_dev_analysis_jobs'));assert.equal(result.semanticOverlaps.length,4);
});
