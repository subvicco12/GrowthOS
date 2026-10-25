const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');const ts=require('typescript');
function load(file,mocks){const module={exports:{}};const js=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 vm.runInNewContext(js,{module,exports:module.exports,Response,Request,URL,URLSearchParams,Buffer,TextDecoder,process,Error,
 require:id=>{assert.ok(Object.hasOwn(mocks,id),`unexpected import ${id}`);return mocks[id];}});return module.exports;}
process.env.GROWTHOS_APP_ORIGIN='https://growthos.example';const security=load('src/server/request-security.ts',{});
const org='00000000-0000-4000-8000-000000000001',site='00000000-0000-4000-8000-000000000002';
let role='owner',session=true;
const route=load('src/app/api/organization-recommendations/route.ts',{
 zod:require('zod'),'../../../server/request-security':security,
 '../../../server/organization-context':{getAuthenticatedOrganizationContext:async()=>{
  if(!session)throw Error('AUTHENTICATION_REQUIRED');return {organization:{id:org,role}};}},
 '../../../server/organization-pagination':{pageError:error=>Response.json({code:String(error)},
  {status:String(error).includes('AUTHENTICATION_REQUIRED')?401:503})}
});
const url=(o=org)=>`https://growthos.example/api/organization-recommendations?organizationId=${o}&websiteId=${site}`;
const input={organizationId:org,websiteId:site,recommendationId:site,expectedRevision:0,evidenceHash:'a'.repeat(64),
 decision:'accept_for_planning',reason:'Review this proposal',idempotencyKey:'synthetic_key_1'};
const post=(body=input,origin='https://growthos.example')=>new Request(url(),{method:'POST',
 headers:{host:'growthos.example',origin,'content-type':'application/json'},body:typeof body==='string'?body:JSON.stringify(body)});
(async()=>{let checks=0;
 let r=await route.GET(new Request(url()));assert.equal(r.status,503);assert.equal((await r.json()).available,false);checks+=2;
 assert.equal((await route.GET(new Request(url(site)))).status,403);checks++;
 session=false;assert.equal((await route.GET(new Request(url()))).status,401);session=true;checks++;
 role='viewer';assert.equal((await route.POST(post())).status,403);role='owner';checks++;
 assert.equal((await route.POST(post({...input,organizationId:site}))).status,403);checks++;
 assert.equal((await route.POST(post({...input,verified:true}))).status,400);checks++;
 assert.equal((await route.POST(post('{'))).status,400);checks++;
 assert.equal((await route.POST(post('x'.repeat(5000)))).status,413);checks++;
 assert.equal((await route.POST(post(input,'https://evil.test'))).status,403);checks++;
 r=await route.POST(post());assert.equal(r.status,503);assert.equal((await r.json()).code,'REVIEW_PERSISTENCE_UNAVAILABLE');checks+=2;
 console.log(`PASS ${checks} mocked recommendation route assertions; no DB writer invoked`);
})().catch(e=>{console.error(e);process.exitCode=1;});
