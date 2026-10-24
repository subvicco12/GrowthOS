const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const ts=require('typescript');
function load(file,mocks){const module={exports:{}};const js=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 vm.runInNewContext(js,{module,exports:module.exports,Response,Request,URL,Buffer,TextDecoder,process,Error,
  require:id=>{assert.ok(Object.hasOwn(mocks,id),`unexpected import ${id}`);return mocks[id];}});return module.exports;}
process.env.GROWTHOS_APP_ORIGIN='https://growthos.example';
const security=load('src/server/request-security.ts',{});
const org='00000000-0000-4000-8000-000000000002';
const websiteId='00000000-0000-4000-8000-000000000001';
function request(website=websiteId){return new Request('https://growthos.example/api/website-features',{method:'PATCH',
 headers:{host:'growthos.example',origin:'https://growthos.example','content-type':'application/json'},
 body:JSON.stringify({websiteId:website,feature:'automation',enabled:false})});}
async function run(enabled,role='owner'){
 const calls=[];let commits=0,rollbacks=0;
 const connection={beginTransaction:async()=>{},execute:async(sql,params)=>{calls.push([sql,params]);return sql.startsWith('SELECT')?[[{enabled}]]:[{}];},
  commit:async()=>{commits++;},rollback:async()=>{rollbacks++;},release:()=>{}};
 const route=load('src/app/api/website-features/route.ts',{
  'node:crypto':{randomUUID:()=>websiteId},'../../../server/request-security':security,
  '../../../server/organization-context':{getAuthenticatedOrganizationContext:async()=>({userId:'actor',organization:{id:org,role}})},
  '../../../server/mysql':{getMySQLPool:()=>({getConnection:async()=>connection})},
  '../../../core/website-feature-controls':{canDisableWebsiteFeature:role=>['owner','admin'].includes(role),
   websiteFeaturePatchSchema:{safeParse:value=>({success:value.enabled===false,data:value})}}
 });
 const response=await route.PATCH(request());return {response,calls,commits,rollbacks};
}
(async()=>{
 let result=await run('0');assert.equal(result.response.status,200);assert.equal(result.calls.filter(([sql])=>sql.startsWith('INSERT')).length,0);
 assert.equal(result.commits,1);
 result=await run('1');assert.equal(result.response.status,200);assert.equal(result.calls.filter(([sql])=>sql.startsWith('INSERT')).length,1);
 assert.deepEqual(Array.from(result.calls[0][1]),[websiteId,org]);
 result=await run('1','viewer');assert.equal(result.response.status,403);assert.equal(result.calls.length,0);
 console.log('PASS 8 mocked disable-only feature assertions');
})().catch(error=>{console.error(error);process.exitCode=1;});
