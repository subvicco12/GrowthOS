import {test} from 'node:test';import assert from 'node:assert/strict';
import {appendProviderRevenue,emptyProviderRevenue,exportProviderRevenue,importProviderRevenue,minorFromDecimal,offlineProviderAdapter,prepareProviderReconciliationHandoff,
 providerFingerprint,providerPortfolioCoverage,reconcileProviderRevenue,validateProviderRevenue,type ProviderRevenueEvent} from '../local-provider-revenue';
import {emptyBacklog,fromRevenueHandoff,validateBacklog} from '../local-product-backlog';
const scope={organizationId:'org_1',websiteId:'site_1'},now='2026-10-26T12:00:00.000Z';
const event=(id='e1',state='completed',basis:ProviderRevenueEvent['basis']='gross'):ProviderRevenueEvent=>({id,...scope,category:'paddle',providerId:'paddle-sandbox',accountId:'acct-1',resourceId:'site-property',
 sourceRecordId:'tx-1',sourceEventId:id,importBatchId:'batch-1',periodFrom:'2026-10-01',periodThrough:'2026-10-26',occurredAt:'2026-10-10T10:00:00.000Z',
 currency:'USD',amountMinor:10000,basis,state,settlementReference:null,relatedEventId:null,provenance:'synthetic',verification:'unverified',authority:'none'});
const put=(events:ProviderRevenueEvent[])=>events.reduce((b,e)=>appendProviderRevenue(b,e,scope,now),emptyProviderRevenue(scope));
test('exact currency scales reject fractional, negative, unsupported and unsafe values',()=>{
 assert.equal(minorFromDecimal('12.34','USD'),1234);assert.equal(minorFromDecimal('12','JPY'),12);assert.equal(minorFromDecimal('12.345','KWD'),12345);
 assert.throws(()=>minorFromDecimal('12.3','JPY'),/PRECISION/);assert.throws(()=>minorFromDecimal('12.345','USD'),/PRECISION/);
 assert.throws(()=>minorFromDecimal('-1','USD'));assert.throws(()=>minorFromDecimal('0.1e3','USD'));
 assert.throws(()=>minorFromDecimal('1000000000000000','USD'),/OVERFLOW/);
 assert.throws(()=>minorFromDecimal('12','XYZ' as 'USD'));
});
test('provider normalization and lifecycle deny forged trust, scope, unknown state and duplicate delivery',()=>{
 assert.equal(offlineProviderAdapter('paddle').normalize(event(),scope,now).verification,'unverified');
 assert.throws(()=>offlineProviderAdapter('stripe').normalize(event(),scope,now),/KIND_DENIED/);
 assert.throws(()=>validateProviderRevenue({...emptyProviderRevenue(scope),events:[{...event(),verification:'independently-verified'}]},scope,now));
 assert.throws(()=>put([{...event(),websiteId:'site_2'}]),/SCOPE_DENIED/);
 assert.throws(()=>put([{...event(),providerId:'unknown provider'}]));
 assert.throws(()=>put([{...event(),state:'invented'}]),/LIFECYCLE_DENIED/);
 assert.throws(()=>put([event(),{...event('e2'),sourceEventId:'e1'}]),/DUPLICATE_DELIVERY/);
 assert.throws(()=>put([event(),{...event('e2'),state:'authorized',basis:'status',amountMinor:0,occurredAt:'2026-10-11T10:00:00.000Z'}]),/TRANSITION_DENIED/);
 assert.throws(()=>put([{...event(),periodThrough:'2026-10-05'}]),/PERIOD_DENIED/);
 assert.throws(()=>put([{...event(),amountMinor:-1}]));
});
test('payment completion is not settlement; refund, fee, dispute and missing settlement remain review-only',()=>{
 const completed=put([event()]);assert.equal(reconcileProviderRevenue(completed,scope,now).exceptions[0].category,'missing-settlement');
 const partial={...event('e2','partially-refunded','refund'),amountMinor:2000,occurredAt:'2026-10-11T10:00:00.000Z',relatedEventId:'e1'};
 const full={...event('e3','refunded','refund'),amountMinor:8000,occurredAt:'2026-10-12T10:00:00.000Z',relatedEventId:'e1'};
 const b=put([event(),partial,full]);assert.equal(b.events.length,3);assert.equal(reconcileProviderRevenue(b,scope,now).verifiedRevenue,'Unavailable');
 assert.throws(()=>put([event(),partial,{...full,amountMinor:9000}]),/REFUND_EXCEEDS_GROSS/);
 assert.throws(()=>put([event(),{...partial,relatedEventId:'foreign'}]),/RELATED_EVENT_DENIED/);
 assert.throws(()=>put([event(),{...partial,currency:'EUR'}]),/RECORD_CONFLICT/);
 assert.throws(()=>put([event(),{...partial,periodFrom:'2026-09-01'}]),/RECORD_CONFLICT/);
 const disputed=put([event(),{...event('e4','disputed','status'),amountMinor:0,occurredAt:'2026-10-11T10:00:00.000Z'}]);
 assert.ok(reconcileProviderRevenue(disputed,scope,now).exceptions.some(x=>x.category==='dispute-open'));
 const fee=put([event(),{...event('e5','completed','fee'),amountMinor:12000,relatedEventId:'e1',occurredAt:'2026-10-11T10:00:00.000Z'}]);
 assert.ok(reconcileProviderRevenue(fee,scope,now).exceptions.some(x=>x.category==='fee-discrepancy'));
 const settled=put([event(),{...event('e6','settled','payout'),amountMinor:9000,settlementReference:'payout-1',occurredAt:'2026-10-11T10:00:00.000Z'}]);
 assert.ok(reconcileProviderRevenue(settled,scope,now).exceptions.some(x=>x.category==='payout-discrepancy'));
});
test('affiliate approval is not payment; reversal and payout have distinct meaning',()=>{
 const approved={...event('a1','approved','gross'),category:'affiliate' as const,amountMinor:2500};
 assert.ok(reconcileProviderRevenue(put([approved]),scope,now).exceptions.some(x=>x.category==='pending-payment-evidence'));
 const paid={...event('a2','paid','payout'),category:'affiliate' as const,amountMinor:2500,settlementReference:'payout-1',occurredAt:'2026-10-11T10:00:00.000Z'};
 assert.equal(reconcileProviderRevenue(put([approved,paid]),scope,now).exceptions.length,0);
 assert.throws(()=>put([{...approved,category:'affiliate',state:'paid',basis:'gross'}]),/BASIS_DENIED/);
 assert.equal(put([approved,{...paid,id:'a3',sourceEventId:'a3',state:'reversed',basis:'status',amountMinor:0,settlementReference:null}]).events.length,2);
});
test('advertising estimate, finalization and receipt remain separate with discrepancy detection',()=>{
 const estimate={...event('d1','estimated','estimate'),category:'adsense' as const,amountMinor:1000};
 const final={...event('d2','finalized','gross'),category:'adsense' as const,amountMinor:900,occurredAt:'2026-10-11T10:00:00.000Z'};
 const issued={...event('d3','payment-issued','payout'),category:'adsense' as const,amountMinor:900,occurredAt:'2026-10-12T10:00:00.000Z'};
 const received={...event('d4','payment-received','payout'),category:'adsense' as const,amountMinor:900,settlementReference:'bank-1',occurredAt:'2026-10-13T10:00:00.000Z'};
 assert.ok(reconcileProviderRevenue(put([estimate,final]),scope,now).exceptions.some(x=>x.category==='estimate-final-difference'));
 assert.ok(reconcileProviderRevenue(put([estimate,final,issued]),scope,now).exceptions.some(x=>x.category==='pending-payment-evidence'));
 assert.equal(reconcileProviderRevenue(put([estimate,final,issued,received]),scope,now).certifiedReconciliation,false);
 assert.throws(()=>put([{...estimate,basis:'gross'}]),/BASIS_DENIED/);
});
test('fingerprint deterministic but not authenticity; portfolio scoped and import bounded',()=>{
 assert.equal(providerFingerprint(event()),providerFingerprint(event()));assert.notEqual(providerFingerprint(event()),providerFingerprint(event('e2')));
 const b=put([event()]);assert.equal(providerPortfolioCoverage([b],scope.organizationId,['site_1','site_2'],now)[0].verifiedRevenue,'Unavailable');
 assert.throws(()=>providerPortfolioCoverage([b],'org_2',['site_1'],now));
 assert.throws(()=>providerPortfolioCoverage([b,b],scope.organizationId,['site_1'],now));
 const wire=exportProviderRevenue(b,scope,now);assert.deepEqual(importProviderRevenue(new TextEncoder().encode(wire),scope,now),b);
 assert.throws(()=>importProviderRevenue(new TextEncoder().encode(wire),{...scope,websiteId:'site_2'},now));
 assert.throws(()=>importProviderRevenue(new TextEncoder().encode(JSON.stringify({...b,version:2})),scope,now));
 assert.throws(()=>importProviderRevenue(new Uint8Array(250001),scope,now),/SIZE_DENIED/);
 assert.throws(()=>importProviderRevenue(new Uint8Array([255]),scope,now));
 assert.equal(validateProviderRevenue(b,scope,now).events.length,1);
});
test('unresolved provider evidence handoff is scoped, review-only and refuses duplicate backlog origin',()=>{
 const b=put([event()]),h=prepareProviderReconciliationHandoff(b,scope,now),proposal=fromRevenueHandoff(h,scope);
 assert.equal(h.kind,'reconciliation-gap');assert.equal(proposal.state,'local-review-only');assert.equal(proposal.estimatedCostMinor,null);
 assert.throws(()=>prepareProviderReconciliationHandoff(emptyProviderRevenue(scope),scope,now),/HANDOFF_DENIED/);
 assert.throws(()=>fromRevenueHandoff(h,{...scope,websiteId:'site_2'}));
 const backlog=emptyBacklog(scope);assert.throws(()=>validateBacklog({...backlog,proposals:[proposal,{...proposal,id:'other'}]},scope),/BACKLOG_DUPLICATE_ORIGIN/);
});
