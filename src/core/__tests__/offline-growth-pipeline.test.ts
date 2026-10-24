import test from 'node:test';
import assert from 'node:assert/strict';
import { runOfflineGrowthPipeline } from '../offline-growth-pipeline';
import type { DiscoveryAuthority, SyntheticDiscoveryTransport } from '../offline-website-discovery';

const input={organizationId:'00000000-0000-4000-8000-000000000001',websiteId:'00000000-0000-4000-8000-000000000002',
 host:'example.test',jobKey:'synthetic_pipeline_1',maxPages:2,maxDepth:2,timeoutMs:1000};
const now='2026-10-25T00:00:00Z';
const authority:DiscoveryAuthority={assertCurrent:async()=>{},claim:async()=> 'new',rateLimit:async()=>{}};
const transport:SyntheticDiscoveryTransport={read:async path=>({finalUrl:'https://example.test'+path,redirects:[],status:200,
 body:path==='/robots.txt'?'User-agent: *':path==='/sitemap.xml'?'<urlset><url><loc>https://example.test/pricing</loc></url></urlset>':'Pricing page',observedAt:now})};
const observation={inspect:async(page:{url:string;status:number;observedAt:string;bodyHash:string})=>({url:page.url,status:page.status,
 observedAt:page.observedAt,sourceHash:page.bodyHash,indexable:true,title:null,wordCount:120,mobileUsability:'fail' as const})};
const competitor={evidenceUrl:'https://competitor.test/plans',observedAt:now,feature:'CSV export',plan:'pro' as const,
 ours:'unknown' as const,approvedBy:'synthetic-admin'};

test('discovery, scoped observation, SEO and manual competitor comparison yield review-only ideas',async()=>{
 const result=await runOfflineGrowthPipeline(input,authority,transport,observation,[competitor],now,new AbortController().signal);
 assert.equal(result.discovery.state,'complete');assert.ok(result.ideas.some(x=>x.problem==='Page title observed absent'));
 assert.ok(result.ideas.some(x=>x.category==='usability'));
 assert.equal(result.competitorState,'unverified');assert.equal(result.competitorIdeas[0].status,'review-only');
 assert.equal(JSON.stringify(result).includes('published'),false);
});
test('wrong observation hash, revoked ownership, stale competitor and private redirects refuse findings',async()=>{
 await assert.rejects(runOfflineGrowthPipeline(input,authority,transport,{inspect:async page=>({...await observation.inspect(page),sourceHash:'0'.repeat(64)})},[],now,new AbortController().signal),/OBSERVATION_PROVENANCE_MISMATCH/);
 const denied:DiscoveryAuthority={...authority,assertCurrent:async()=>{throw Error('OWNERSHIP_REVOKED');}};
 await assert.rejects(runOfflineGrowthPipeline(input,denied,transport,observation,[],now,new AbortController().signal),/OWNERSHIP_REVOKED/);
 await assert.rejects(runOfflineGrowthPipeline(input,authority,transport,observation,[{...competitor,observedAt:'2026-09-01T00:00:00Z'}],now,new AbortController().signal),/COMPETITOR_EVIDENCE_DENIED/);
 const unsafe:SyntheticDiscoveryTransport={read:async path=>({...await transport.read(path,new AbortController().signal),
  redirects:path==='/pricing'?['https://127.0.0.1/']:[]})};
 const result=await runOfflineGrowthPipeline(input,authority,unsafe,observation,[],now,new AbortController().signal);
 assert.equal(result.discovery.state,'unknown');assert.equal(result.ideas.length,0);
});
