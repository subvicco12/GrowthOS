import test from 'node:test';
import assert from 'node:assert/strict';
import { discoverSyntheticWebsite, type DiscoveryAuthority, type SyntheticDiscoveryTransport } from '../offline-website-discovery';

const org='00000000-0000-4000-8000-000000000001';
const site='00000000-0000-4000-8000-000000000002';
const input={organizationId:org,websiteId:site,host:'example.test',jobKey:'synthetic_job_1',maxPages:3,maxDepth:2,timeoutMs:1000};
const sitemap='<urlset><url><loc>https://example.test/a</loc></url><url><loc>https://example.test/private</loc></url><url><loc>https://example.test/a</loc></url><url><loc>https://example.test/b</loc></url></urlset>';
function fixture(overrides:Record<string,Partial<{body:string;status:number;finalUrl:string;redirects:string[]}>>={}) {
 const calls:string[]=[];
 const transport:SyntheticDiscoveryTransport={read:async path=>{calls.push(path);
  const base=path==='/robots.txt'?'User-agent: *\nDisallow: /private':path==='/sitemap.xml'?sitemap:'synthetic page';
  return {body:base,status:200,finalUrl:'https://example.test'+path,redirects:[],observedAt:'2026-10-25T00:00:00Z',...overrides[path]};}};
 let authorizations=0; let claims=0;
 const authority:DiscoveryAuthority={assertCurrent:async scope=>{assert.equal(scope.organizationId,org);assert.equal(scope.websiteId,site);authorizations++;},
  claim:async()=>{claims++;return claims===1?'new':'duplicate';},rateLimit:async()=>{}};
 return {calls,transport,authority,get authorizations(){return authorizations;}};
}
test('bounded offline discovery respects robots, deduplicates sitemap URLs and rechecks scope',async()=>{
 const x=fixture(); const result=await discoverSyntheticWebsite(input,x.authority,x.transport,new AbortController().signal);
 assert.equal(result.state,'complete');assert.deepEqual(result.pages.map(p=>p.url),['https://example.test/a','https://example.test/b']);
 assert.equal(result.pages[0].bodyHash.length,64);assert.ok(x.authorizations>=3);assert.ok(!x.calls.includes('/private'));
 await assert.rejects(discoverSyntheticWebsite(input,x.authority,x.transport,new AbortController().signal),/DISCOVERY_DUPLICATE_JOB/);
});
test('unknown robots, malformed/oversized sitemap and off-host redirects fail closed',async()=>{
 const cases: Array<[string,Partial<{body:string;status:number;finalUrl:string;redirects:string[]}>,string]> = [
  ['/robots.txt',{status:503},'unavailable'],
  ['/sitemap.xml',{body:'<!DOCTYPE urlset [<!ENTITY x SYSTEM "file:///etc/passwd">]><urlset>&x;</urlset>'},'unknown'],
  ['/sitemap.xml',{body:'x'.repeat(131073)},'unknown'],
  ['/a',{finalUrl:'https://127.0.0.1/admin'},'unknown'],
  ['/a',{redirects:['https://evil.test/']},'unknown']
 ];
 for(const [path,override,expected] of cases){const x=fixture({[path]:override});const result=await discoverSyntheticWebsite(input,x.authority,x.transport,new AbortController().signal);
  assert.equal(result.state,expected);assert.equal(result.pages.length,0);}
});
test('authority, rate and input refusal precede transport; cancellation and timeout clear partial results',async()=>{
 const x=fixture();
 await assert.rejects(discoverSyntheticWebsite({...input,host:'127.0.0.1'},x.authority,x.transport,new AbortController().signal),/DISCOVERY_INPUT_DENIED/);
 await assert.rejects(discoverSyntheticWebsite({...input,maxPages:21},x.authority,x.transport,new AbortController().signal),/DISCOVERY_INPUT_DENIED/);
 assert.equal(x.calls.length,0);
 const deny:DiscoveryAuthority={...x.authority,assertCurrent:async()=>{throw Error('OWNERSHIP_REVOKED');}};
 await assert.rejects(discoverSyntheticWebsite(input,deny,x.transport,new AbortController().signal),/OWNERSHIP_REVOKED/);
 assert.equal(x.calls.length,0);
 const cancelled=new AbortController();cancelled.abort();
 const y=fixture();const result=await discoverSyntheticWebsite(input,y.authority,y.transport,cancelled.signal);
 assert.equal(result.state,'cancelled');assert.equal(y.calls.length,0);
  const timeout=fixture();
  const hung:SyntheticDiscoveryTransport={read:async()=>new Promise(()=>{})};
  const timed=await discoverSyntheticWebsite({...input,timeoutMs:100},timeout.authority,hung,new AbortController().signal);
  assert.equal(timed.state,'cancelled');assert.equal(timed.pages.length,0);
  const limit=fixture();
  await assert.rejects(discoverSyntheticWebsite(input,{...limit.authority,rateLimit:async()=>{throw Error('QUOTA_EXHAUSTED');}},limit.transport,new AbortController().signal),/QUOTA_EXHAUSTED/);
  assert.equal(limit.calls.length,0);
});
