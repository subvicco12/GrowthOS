import {test} from 'node:test';
import assert from 'node:assert/strict';
import {emptyRevenuePreview,validateRevenuePreview,analyzeFunnel,calculateRevenueScenario,compareCompetitorPricing,
 revenueOpportunities,prepareRevenueHandoff,exportRevenuePreview,importRevenuePreview,type RevenuePreview} from '../local-revenue-workspace';
import {emptyBacklog,fromRevenueHandoff,validateBacklog} from '../local-product-backlog';
import type {CompetitorPackage} from '../local-competitor-workspace';
const scope={organizationId:'org_1',websiteId:'site_1'},today='2026-10-26';
const base=()=>emptyRevenuePreview(scope);
const funnel=()=>({id:'f1',from:'2026-09-01',through:'2026-09-30',source:'Manual report',provenance:'manual-unverified' as const,
 visitorDefinition:'sessions' as const,landingVisits:100,signupStarts:40,signupCompletions:30,activations:20,upgradeVisits:30,
 checkoutStarts:25,checkoutCompletions:5,openingPaidSubscribers:50,renewals:40,cancellations:10});
const scenario=()=>({id:'s1',kind:'paid-conversion' as const,periodFrom:'2026-09-01',periodThrough:'2026-09-30',currency:'USD',
 audienceCount:100,baselineOutcomes:5,proposedOutcomes:10,valuePerOutcomeMinor:1000,assumption:'Hypothetical paid customer value',state:'hypothetical-local-only' as const});
const competitors=():CompetitorPackage=>({format:'growthos-competitor-preview',version:1,...scope,authority:'local-preview-only',
 competitors:[{id:'c1',name:'Example vendor',website:'https://example.org',category:'manual comparison',positioning:'Unknown positioning',segments:[]}],
 ownFeatures:[{id:'x1',name:'Export feature',category:'monetization',description:'Manual feature comparison',availability:'unknown',tiers:[],dependencies:[],effort:'unknown',benefit:'Customer value unknown'}],
 claims:[{id:'claim1',competitorId:'c1',featureId:'x1',availability:'reported',tiers:['pro'],source:'https://example.org',observedOn:today,
 claim:'Manually supplied competitor feature claim',pricing:{currency:'USD',minor:1200,period:'month'},evidenceStatus:'unverified-manual',revoked:false}]});
const proposed=():RevenuePreview=>({...base(),profile:{...base().profile,subscriptionModel:'free-pro-business',tiers:[
 {tier:'free',features:['Basic access'],usageLimit:null,price:null},
 {tier:'pro',features:['Basic access'],usageLimit:null,price:{currency:'USD',minor:1000,interval:'month',region:'US'}},
 {tier:'business',features:['Basic access'],usageLimit:null,price:{currency:'USD',minor:2000,interval:'month',region:'US'}}]},funnels:[funnel()]});
test('local profile refuses cross-tenant, duplicate tiers, forged authority and markup',()=>{
 const p=proposed();assert.equal(validateRevenuePreview(p,scope).profile.subscriptionModel,'free-pro-business');
 assert.throws(()=>validateRevenuePreview(p,{...scope,organizationId:'org_2'}));
 assert.throws(()=>validateRevenuePreview({...p,authority:'approved'},scope));
 assert.throws(()=>validateRevenuePreview({...p,profile:{...p.profile,category:'<script>'}},scope));
 assert.throws(()=>validateRevenuePreview({...p,profile:{...p.profile,tiers:[p.profile.tiers[0],p.profile.tiers[0]]}},scope));
});
test('one-period funnel refuses impossible counts and exposes unavailable denominators',()=>{
 assert.equal(analyzeFunnel(funnel()).checkout,0.2);
 assert.equal(analyzeFunnel({...funnel(),checkoutStarts:null,checkoutCompletions:null}).checkout,null);
 assert.throws(()=>analyzeFunnel({...funnel(),checkoutCompletions:26}),/REVENUE_FUNNEL_DENIED/);
 assert.throws(()=>analyzeFunnel({...funnel(),landingVisits:-1}));
 assert.throws(()=>analyzeFunnel({...funnel(),from:'2026-10-01'}),/REVENUE_PERIOD_DENIED/);
 assert.throws(()=>analyzeFunnel({...funnel(),source:'Other',visitorDefinition:'mixed'}));
});
test('scenario is hypothetical, bounded, finite and requires coherent assumptions',()=>{
 assert.equal(calculateRevenueScenario(scenario()).hypotheticalAdditionalMinor,5000);
 assert.match(calculateRevenueScenario(scenario()).warning,/not revenue forecasts/);
 assert.throws(()=>calculateRevenueScenario({...scenario(),baselineOutcomes:11}));
 assert.throws(()=>calculateRevenueScenario({...scenario(),valuePerOutcomeMinor:Number.MAX_SAFE_INTEGER}),/OVERFLOW/);
 assert.throws(()=>calculateRevenueScenario({...scenario(),audienceCount:NaN}));
 assert.throws(()=>calculateRevenueScenario({...scenario(),currency:'BTC<script>'}));
});
test('competitor price comparison refuses currency or interval equivalence claims',()=>{
 const p=proposed(),c=competitors();const comparison=compareCompetitorPricing(c,scope,today,p)[0];
 assert.equal(comparison.priceComparison?.[0].differenceMinor,-200);
 assert.match(comparison.limitation,/Regional scope/);
 assert.equal(compareCompetitorPricing({...c,claims:[{...c.claims[0],pricing:{...c.claims[0].pricing!,currency:'EUR'}}]},scope,today,p)[0].priceComparison,null);
 assert.equal(compareCompetitorPricing({...c,claims:[{...c.claims[0],pricing:{...c.claims[0].pricing!,period:'year'}}]},scope,today,p)[0].priceComparison,null);
 assert.throws(()=>compareCompetitorPricing({...c,claims:[{...c.claims[0],pricing:{currency:'USD',minor:-1,period:'month'}}]},scope,today,p));
 assert.throws(()=>compareCompetitorPricing(c,{...scope,websiteId:'site_2'},today,p));
});
test('evidence-labeled opportunities produce scoped review-only backlog handoff without duplicate transfer',()=>{
 const p=proposed(),c=competitors(),list=revenueOpportunities(p,scope,today,c);
 assert.ok(list.some(x=>x.kind==='tier-differentiation'));
 assert.ok(list.some(x=>x.kind==='conversion-friction'));
 assert.ok(list.some(x=>x.kind==='competitor-package'));
 assert.ok(list.every(x=>x.cost==='unknown'&&x.impact==='unknown'&&x.authority==='review-only'));
 const h=prepareRevenueHandoff(p,scope,today,list[0].id,c),proposal=fromRevenueHandoff(h,scope);
 assert.equal(proposal.origin,'revenue-preview');assert.equal(proposal.state,'local-review-only');
 assert.throws(()=>fromRevenueHandoff(h,{...scope,websiteId:'site_2'}));
 const b=emptyBacklog(scope);assert.throws(()=>validateBacklog({...b,proposals:[proposal,{...proposal,id:'other'}]},scope),/BACKLOG_DUPLICATE_ORIGIN/);
 assert.throws(()=>prepareRevenueHandoff(p,scope,today,'revenue:site_2:conversion-friction',c));
});
test('import export preserves local provenance but refuses version, scope, oversized, forged state and duplicate IDs',()=>{
 const p={...proposed(),scenarios:[scenario()],experiments:[{id:'e1',hypothesis:'Compare value',segment:'Pro users',existingTier:'pro' as const,alternativeTier:'business' as const,
 existingPrice:null,alternativePrice:null,customerBenefit:'Review value',risks:'Unknown risks',measurement:'Measure conversion',successCriteria:'Review outcomes',rollback:'Restore previous proposal',state:'local-review-only' as const}]};
 const wire=exportRevenuePreview(p,scope),bytes=new TextEncoder().encode(wire);
 assert.deepEqual(importRevenuePreview(bytes,scope),validateRevenuePreview(p,scope));
 assert.throws(()=>importRevenuePreview(bytes,{...scope,websiteId:'site_2'}));
 assert.throws(()=>importRevenuePreview(new TextEncoder().encode(JSON.stringify({...p,version:2})),scope));
 assert.throws(()=>importRevenuePreview(new TextEncoder().encode(JSON.stringify({...p,authority:'approved'})),scope));
 assert.throws(()=>importRevenuePreview(new TextEncoder().encode(JSON.stringify({...p,funnels:[funnel(),funnel()]})),scope),/REVENUE_DUPLICATE_DENIED/);
 assert.throws(()=>importRevenuePreview(new Uint8Array(250001),scope),/REVENUE_IMPORT_SIZE_DENIED/);
 assert.throws(()=>importRevenuePreview(new Uint8Array([255]),scope));
});
