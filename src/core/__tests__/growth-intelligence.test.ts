import test from 'node:test';
import assert from 'node:assert/strict';
import { rankGrowthSignals, buildNextBestActions } from '../growth-intelligence';
import { inspectSeoPages } from '../seo-intelligence';
import { findFunnelSignals } from '../cro-intelligence';
import { summarizeRevenue } from '../revenue-intelligence';

test('ranks evidence-backed growth signals and preserves safety class',()=>{
 const signals=rankGrowthSignals([
  {id:'a',siteId:'1',category:'seo',title:'Fix title',description:'',evidence:[{source:'crawl',observedAt:'x'}],impact:5,confidence:5,effort:1,recurringCostUsd:0,risk:1,successMetric:'CTR'},
  {id:'b',siteId:'1',category:'revenue',title:'Change pricing',description:'',evidence:[{source:'pricing',observedAt:'x'}],impact:5,confidence:5,effort:1,recurringCostUsd:0,risk:4,successMetric:'MRR'},
 ]);
 assert.equal(signals[0].title,'Fix title'); assert.equal(signals[1].approvalClass,'red');
 assert.equal(buildNextBestActions(signals,2).length,2);
});

test('SEO inspection is deterministic',()=>{
 const f=inspectSeoPages([{url:'/x',status:200,indexable:true,h1Count:0,wordCount:100,internalLinks:0}]);
 assert.equal(f.some(x=>x.key==='missing-title'),true); assert.equal(f.some(x=>x.key==='h1-count'),true);
});

test('CRO identifies low conversion funnel steps',()=>{
 const f=findFunnelSignals([{key:'signup',name:'Signup',visitors:100,conversions:5},{key:'tiny',name:'Tiny',visitors:5,conversions:0}]);
 assert.equal(f.length,1); assert.equal(f[0].rate,.05);
});

test('revenue summary aggregates portfolio events',()=>{
 const r=summarizeRevenue([{siteId:'1',source:'organic',visitors:100,conversions:10,revenueUsd:50},{siteId:'1',source:'affiliate',visitors:50,conversions:5,revenueUsd:25}]);
 assert.equal(r[0].visitors,150); assert.equal(r[0].revenueUsd,75); assert.equal(r[0].conversionRate,.1);
});
