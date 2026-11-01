import test from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';
import {validateReviewBundle} from '../review-bundle';import {LocalObservationProvider,ZeroSpendReservation,productionConnector} from '../provider-evidence';
import {localWordPressFixtureTransport} from '../../server/wordpress-readonly-fixture';import {createSession04Handlers,assertSession04Runtime} from '../../server/session04-http';
import type {Session04Portfolio} from '../../server/session04-portfolio';
const org=randomUUID(),site=randomUUID(),actor=randomUUID(),approval=randomUUID(),date=new Date().toISOString();
const bundle={version:'GrowthOSReviewBundle/v1',organizationId:org,websiteId:site,source:'isolated-017-018',target:'canonical_review_quarantine',records:[{kind:'internal_approval',id:approval,createdAt:date,title:'Internal review',actionType:'manual_analysis',status:'approved',trust:'internal_only'}]};
test('versioned review bundle preserves internal-only trust and rejects credential or authority promotion',()=>{
 assert.equal(validateReviewBundle(bundle,org,site).records.length,1);
 for(const bad of [{...bundle,target:'canonical_production'},{...bundle,secret:'credential'},{...bundle,records:[{...bundle.records[0],trust:'verified'}]},{...bundle,records:[...bundle.records,...bundle.records]}])assert.throws(()=>validateReviewBundle(bad,org,site));
 assert.throws(()=>validateReviewBundle(bundle,randomUUID(),site),/BUNDLE_SCOPE_MISMATCH/);
 assert.throws(()=>validateReviewBundle({...bundle,records:[{kind:'approval_decision',id:randomUUID(),approvalId:randomUUID(),actorId:actor,idempotencyKey:'abcdefgh',decision:'approved',note:null,trust:'internal_only',createdAt:date}]},org,site),/BUNDLE_APPROVAL_MISSING/);
});
test('local artifact adapter derives bounded observations without executing scripts or fetching assets',async()=>{
 const adapter=new LocalObservationProvider(),result=await adapter.collect({websiteId:site,html:'<h1>Observed</h1><img src="http://169.254.169.254/"><script>throw Error()</script>'},new AbortController().signal);
 assert.equal(result.sourceKind,'observed_local');assert.equal(result.measurements.headingMarkupCount,1);assert.equal(result.authority,'unverified');assert.ok(result.measurements.utf8Bytes>0);
 await assert.rejects(adapter.collect({...result,sourceKind:'observed_local'},new AbortController().signal));const abort=new AbortController();abort.abort();await assert.rejects(adapter.collect({},abort.signal),/OBSERVATION_CANCELLED/);
});
test('zero-spend reservation and production connector contracts refuse side effects and paid providers',async()=>{
 const budget=new ZeroSpendReservation();assert.equal((await budget.reserve({estimatedMinor:'0',externalSideEffect:false})).reservedMinor,'0');await assert.rejects(budget.reserve({estimatedMinor:'1',externalSideEffect:false}));await assert.rejects(budget.reserve({estimatedMinor:'0',externalSideEffect:true}));assert.equal(productionConnector().state,'disabled');await assert.rejects(productionConnector().enroll());
});
test('WordPress fixture transport refuses arbitrary URLs, credentials, ports, DNS targets and absent opt-in',()=>{
 for(const url of ['http://localhost:33320','http://127.0.0.1:33321','https://production.example.org','http://user:pass@127.0.0.1:33320','http://127.0.0.1:33320/?redirect=evil','http://169.254.169.254/'])assert.throws(()=>localWordPressFixtureTransport({GROWTHOS_WORDPRESS_FIXTURE_URL:url,GROWTHOS_SESSION04_DISPOSABLE:'YES',GROWTHOS_RO_FIXTURE_ADMIN_TOKEN:'private'}));
 assert.throws(()=>localWordPressFixtureTransport({}));assert.ok(localWordPressFixtureTransport({GROWTHOS_SESSION04_DISPOSABLE:'YES',GROWTHOS_RO_FIXTURE_ADMIN_TOKEN:'fixture-only'}));
});
test('Session 04 gate cannot promote normal or remote schemas',()=>{
 const env={GROWTHOS_SESSION02_DISPOSABLE:'YES',GROWTHOS_SESSION03_DISPOSABLE:'YES',GROWTHOS_SESSION04_DISPOSABLE:'YES',GROWTHOS_TEST_DB_DISPOSABLE:'YES',GROWTHOS_DB_HOST:'127.0.0.1',GROWTHOS_DB_NAME:'growthos_test_unit'};assert.doesNotThrow(()=>assertSession04Runtime(env));assert.throws(()=>assertSession04Runtime({...env,GROWTHOS_SESSION04_DISPOSABLE:''}));assert.throws(()=>assertSession04Runtime({...env,GROWTHOS_DB_NAME:'production'}));
});
process.env.GROWTHOS_APP_ORIGIN='https://growthos.example';
function api(role='owner'){let calls=0;const store={portfolio:async()=>{calls++;return {items:[],nextCursor:null};},fleet:async()=>{calls++;return {stopped:true};}}as unknown as Session04Portfolio;return {calls:()=>calls,...createSession04Handlers(async()=>{if(role==='anonymous')throw Error('AUTHENTICATION_REQUIRED');return {userId:actor,organization:{id:org,role}};},()=>store,()=>{})};}
const request=(body:unknown,headers:Record<string,string>={})=>new Request('https://growthos.example/api/portfolio-operations',{method:'POST',headers:{origin:'https://growthos.example',host:'growthos.example',...headers},body:JSON.stringify(body)});
test('portfolio API enforces tenant, owner/admin, canonical origin and zero-spend-only policy',async()=>{
 const body={organizationId:org,action:'fleet',stopped:false,aiLimitMinor:'0',externalEnabled:false};for(const [role,status]of [['anonymous',401],['viewer',403],['editor',403]]as const){const a=api(role);assert.equal((await a.POST(request(body))).status,status);assert.equal(a.calls(),0);}
 const a=api();assert.equal((await a.POST(request({...body,aiLimitMinor:'100'}))).status,400);assert.equal((await a.POST(request({...body,organizationId:randomUUID()}))).status,403);assert.equal((await a.POST(request(body,{origin:'https://evil.example'}))).status,403);assert.equal(a.calls(),0);assert.equal((await a.POST(request(body))).status,200);
});
test('portfolio reads reject duplicate filters and selected-organization changes',async()=>{const a=api('viewer'),url=`https://growthos.example/api/portfolio-operations?organizationId=${org}`;assert.equal((await a.GET(new Request(url))).status,200);assert.equal((await a.GET(new Request(url+'&status=all&status=paused'))).status,400);assert.equal((await a.GET(new Request(url.replace(org,randomUUID())))).status,403);});
