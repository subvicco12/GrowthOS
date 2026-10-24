const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const ts=require('typescript');
const site='00000000-0000-4000-8000-000000000001',org='00000000-0000-4000-8000-000000000002';
function load(file,mocks){const js=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const module={exports:{}};vm.runInNewContext(js,{module,exports:module.exports,Response,Request,URL,URLSearchParams,Buffer,TextDecoder,Error,
  require:id=>{assert.ok(Object.hasOwn(mocks,id),`unexpected import ${id}`);return mocks[id];}});return module.exports;}
const pagination=load('src/server/organization-pagination.ts',{zod:require('zod')});
function routes({role='owner',error=null,siteVisible=true,trust=null,sqlFailure=false,destinationEnabled=true}={}){
 const calls=[];
 const context={'../../../server/organization-context':{getAuthenticatedOrganizationContext:async()=>{
  if(error)throw Error(error);return{organization:{id:org,role}};
 }}};
 const db={'../../../server/mysql':{getMySQLPool:()=>({execute:async(sql,params)=>{
  calls.push({sql,params});if(sqlFailure)throw Error('DATABASE_UNAVAILABLE');
  if(sql.includes('FROM growth_websites'))return[siteVisible?[{id:site}]:[]];
  if(sql.includes('FROM growth_publication_destinations'))return[[{revision:'rev1',target:'https://site.test/',enabled:destinationEnabled?1:0}]];
  if(sql.includes('FROM growth_connector_evidence_history'))return[[{issuer:'synthetic',key_id:'key1',event_id:'probe1',channel:'site',destination_id:'dest1',sequence:'1',observed_at:'2026-10-24T00:00:00Z',recorded_status:'verified'}]];
  throw Error('UNEXPECTED_SQL');
 }})}};
 return {calls,
  history:load('src/app/api/organization-connector-history/route.ts',{...context,...db,'../../../server/organization-pagination':pagination,zod:require('zod')}),
  health:load('src/app/api/organization-connector-health/route.ts',{...context,...db,'../../../server/organization-pagination':pagination,zod:require('zod'),
   '../../../server/connector-health-runtime':{currentConnectorHealthRuntime:()=>trust}})};
}
const historyUrl='https://growthos.example/api/organization-connector-history?websiteId='+site;
const healthUrl='https://growthos.example/api/organization-connector-health?websiteId='+site+'&channel=site&destinationId=dest1';
(async()=>{let checks=0;
 for(const error of ['AUTHENTICATION_REQUIRED','ORGANIZATION_FORBIDDEN']){
  const r=routes({error});for(const method of [['history',historyUrl],['health',healthUrl]]){
   const response=await r[method[0]].GET(new Request(method[1]));
   assert.equal(response.status,error==='AUTHENTICATION_REQUIRED'?401:403);assert.equal(r.calls.length,0);checks+=2;
  }
 }
 const viewer=routes({role:'viewer'});
 assert.equal((await viewer.history.GET(new Request(historyUrl))).status,403);assert.equal(viewer.calls.length,0);checks+=2;
 const foreign=routes({siteVisible:false});
 assert.equal((await foreign.history.GET(new Request(historyUrl))).status,404);
 assert.equal((await foreign.health.GET(new Request(healthUrl))).status,404);
 assert.ok(foreign.calls.every(c=>c.params[0]===org));checks+=3;
 const malformed=routes();
 for(const url of [healthUrl+'&websiteId='+site,healthUrl+'&unexpected=1',healthUrl.replace('dest1','https://evil.test'),historyUrl.replace(site,'bad')]){
  const route=url.includes('connector-history')?malformed.history:malformed.health;
  assert.equal((await route.GET(new Request(url))).status,400);checks++;
 }
 assert.equal(malformed.calls.length,0);checks++;
 const absent=routes();const health=await absent.health.GET(new Request(healthUrl));
 assert.equal(health.status,200);assert.equal((await health.json()).state,'unknown');
 assert.equal(absent.calls.some(c=>c.sql.includes('growth_publication_destinations')),false);checks+=3;
 const recorded=routes();const historical=await recorded.history.GET(new Request(historyUrl));const body=await historical.json();
 assert.equal(historical.status,200);assert.equal(body.trustworthyHealth,false);
 assert.equal(body.items[0].verification,'unverified_record');
 assert.equal(JSON.stringify(body).includes('signature'),false);
 assert.deepEqual(Array.from(recorded.calls[1].params),[org,site]);checks+=5;
 let inspected=null;const trusted=routes({trust:{capability:'independent-connector-health',service:{inspectHealth:async(d)=>{
  inspected=d;return{state:'verified',checkedAt:'2026-10-24T00:00:00Z',lastSuccessfulAt:'2026-10-24T00:00:00Z',reason:'INDEPENDENTLY_VERIFIED_PROBE'};}}}});
 const proof=await trusted.health.GET(new Request(healthUrl));assert.equal((await proof.json()).state,'verified');
 assert.equal(inspected.organizationId,org);assert.equal(inspected.websiteId,site);assert.equal(inspected.id,'dest1');checks+=4;
 const disabled=routes({destinationEnabled:false,trust:{capability:'independent-connector-health',service:{inspectHealth:async()=>{throw Error('UNEXPECTED_HEALTH');}}}});
 const disabledBody=await (await disabled.health.GET(new Request(healthUrl))).json();
 assert.equal(disabledBody.state,'unknown');assert.equal(disabledBody.reason,'DESTINATION_DISABLED');checks+=2;
 const failed=routes({trust:{capability:'independent-connector-health',service:{inspectHealth:async()=>{throw Error('REVOKED');}}}});
 assert.equal((await (await failed.health.GET(new Request(healthUrl))).json()).state,'unavailable');checks++;
 const outage=routes({sqlFailure:true});assert.equal((await outage.history.GET(new Request(historyUrl))).status,503);checks++;
 console.log(`PASS ${checks} mocked connector route assertions; no external calls or database connection`);
})().catch(error=>{console.error(error);process.exitCode=1;});
