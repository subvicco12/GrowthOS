import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { validateObservations,summarizeAnalytics,periodBuckets,compareReportingPeriods,performanceOpportunities,type AnalyticsObservation } from '../offline-analytics';
import { exportAnalytics,importAnalytics,exportAnalyticsCsv } from '../offline-analytics-transfer';
const scope={organizationId:'org-a',websiteIds:['site-a','site-b']};
const base:AnalyticsObservation={id:'550e8400-e29b-41d4-a716-446655440000',organizationId:'org-a',websiteId:'site-a',
 source:'manual-report',sourceKind:'manual-import',observedAt:'2026-10-25T10:00:00Z',day:'2026-10-25',
 visitorDefinition:'sessions',attribution:'last-touch',currency:'USD',channel:'organic',landingPage:'https://site.example/page',
 contentId:null,campaignId:null,visits:100,engagedVisits:60,conversions:10,searchImpressions:1000,searchClicks:50,
 revenueMinor:5000,spendMinor:2000,costKind:'marketing',revenueKind:'subscription',settled:false};
const period={...scope,from:'2026-10-25',through:'2026-10-25'};
test('correct rates, ROI, ROAS and explicit unverified attribution',()=>{
 const s=summarizeAnalytics([base],period);
 assert.equal(s.conversionRate,.1);assert.equal(s.searchCtr,.05);assert.equal(s.roi,1.5);assert.equal(s.roas,2.5);
 assert.equal(s.costPerConversion,200);assert.equal(s.profitContributionMinor,3000);
 assert.ok(s.warnings.some(w=>w.includes('not payment settlement')));
 assert.equal(s.byWebsite[1].visits,null);
 assert.equal(periodBuckets([base],period,'weekly')[0].period,'2026-10-19');
 assert.equal(periodBuckets([base],period,'monthly')[0].period,'2026-10');
});
test('missing values, zero denominator and incompatibilities never become fabricated rates',()=>{
 const unknown={...base,visits:null,conversions:null,revenueMinor:null,revenueKind:null,spendMinor:null,costKind:null};
 const s=summarizeAnalytics([unknown],period);assert.equal(s.visits,null);assert.equal(s.conversionRate,null);assert.equal(s.roi,null);
 assert.equal(summarizeAnalytics([{...base,visits:0,engagedVisits:0,conversions:0,spendMinor:0}],period).roi,null);
 const second={...base,id:'550e8400-e29b-41d4-a716-446655440001',websiteId:'site-b',currency:'EUR'};
 assert.equal(summarizeAnalytics([base,second],period).revenueMinor,null);
 assert.equal(summarizeAnalytics([base,{...second,currency:'USD',attribution:'first-touch'}],period).conversionRate,null);
 assert.equal(summarizeAnalytics([base,{...second,currency:'USD',visitorDefinition:'unique-visitors'}],period).visits,null);
 assert.equal(summarizeAnalytics([],period).visits,null);
 assert.equal(summarizeAnalytics([base],{...period,from:'2026-10-26',through:'2026-10-27'}).observationCount,0);
});
test('validation refuses invalid counts, units, scope, duplicates and dates',()=>{
 assert.throws(()=>validateObservations([{...base,organizationId:'other'}],scope),/ANALYTICS_SCOPE_DENIED/);
 assert.throws(()=>validateObservations([{...base,websiteId:'site-x'}],scope),/ANALYTICS_SCOPE_DENIED/);
 assert.throws(()=>validateObservations([base,base],scope),/ANALYTICS_DUPLICATE_OBSERVATION/);
 assert.throws(()=>validateObservations([base,{...base,id:'550e8400-e29b-41d4-a716-446655440003'}],scope),/ANALYTICS_DUPLICATE_MEASUREMENT/);
 assert.throws(()=>validateObservations([{...base,conversions:101}],scope),/ANALYTICS_MEASUREMENT_DENIED/);
 assert.throws(()=>validateObservations([{...base,visits:NaN}],scope));
 assert.throws(()=>validateObservations([{...base,day:'2026-02-30'}],scope));
 assert.throws(()=>validateObservations([{...base,observedAt:'2026-10-24T10:00:00Z'}],scope),/ANALYTICS_MEASUREMENT_DENIED/);
 assert.throws(()=>validateObservations([{...base,revenueMinor:100,currency:null}],scope),/ANALYTICS_MEASUREMENT_DENIED/);
 assert.throws(()=>summarizeAnalytics([base],{...period,from:'2026-10-26'}),/ANALYTICS_PERIOD_DENIED/);
});
test('bounded strict import and safe CSV round trip preserve unverified status',()=>{
 const json=exportAnalytics([base],scope);assert.deepEqual(importAnalytics(new TextEncoder().encode(json),scope).observations,[base]);
 assert.throws(()=>importAnalytics(new TextEncoder().encode(json),{...scope,organizationId:'org-b'}),/ANALYTICS_IMPORT_SCOPE_DENIED/);
 assert.throws(()=>importAnalytics(new TextEncoder().encode(JSON.stringify({...JSON.parse(json),version:2})),scope));
 assert.throws(()=>importAnalytics(new Uint8Array(500001),scope),/ANALYTICS_IMPORT_SIZE_DENIED/);
 assert.throws(()=>importAnalytics(new TextEncoder().encode(JSON.stringify({...JSON.parse(json),token:'secret'})),scope));
 const injected={...base,source:'=HYPERLINK("https://bad.test")'};
 assert.ok(exportAnalyticsCsv([injected],scope).includes('"\'=HYPERLINK'));
});
test('previous period and review ideas require measured comparable evidence',()=>{
 const prior={...base,id:'550e8400-e29b-41d4-a716-446655440002',day:'2026-10-24',observedAt:'2026-10-24T10:00:00Z',visits:120};
 const compare=compareReportingPeriods([prior,base],period);
 assert.equal(compare.comparable,true);assert.equal(compare.visitChange,-20);
 assert.equal(compareReportingPeriods([base],period).visitChange,null);
 assert.equal(compareReportingPeriods([prior,{...base,currency:'EUR'}],period).comparable,false);
 const differentSource={...prior,source:'other-report'};
 assert.equal(summarizeAnalytics([differentSource,base],{...scope,from:'2026-10-24',through:'2026-10-25'}).visits,null);
 const low={...base,searchClicks:10,conversions:0};
 const ideas=performanceOpportunities([low],period);assert.deepEqual(ideas.map(i=>i.category),['seo','conversion']);
 assert.ok(ideas.every(i=>i.authority==='review-only'&&i.impact==='unknown'&&i.evidenceIds.includes(base.id)));
 assert.deepEqual(performanceOpportunities([],period),[]);
});
