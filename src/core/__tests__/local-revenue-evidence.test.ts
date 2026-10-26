import {test} from 'node:test';import assert from 'node:assert/strict';
import {addRevenueEvidence,emptyRevenueEvidence,exportRevenueEvidence,importRevenueEvidence,portfolioRevenueCoverage,
 revenueEvidenceSummary,validateRevenueEvidence,type RevenueEvidence} from '../local-revenue-evidence';
const scope={organizationId:'org_1',websiteId:'site_1'},today='2026-10-26';
const record=(id='r1'):RevenueEvidence=>({id,...scope,source:'subscription',sourceLabel:'Manual subscription report',externalReference:'Report reference '+id,
 from:'2026-09-01',through:'2026-09-30',observedOn:'2026-10-01',currency:'USD',amountMinor:1000,basis:'gross-reported',
 provenance:'manual-unverified',reconciliation:'not-reconciled',authority:'none'});
test('scoped observations remain local and cannot claim payment or independent verification',()=>{
 const b=addRevenueEvidence(emptyRevenueEvidence(scope),record(),scope,today);
 assert.equal(b.observations[0].amountMinor,1000);assert.equal(revenueEvidenceSummary(b,scope,today).verifiedRevenueMinor,null);
 assert.throws(()=>addRevenueEvidence(b,{...record('r2'),authority:'verified'},scope,today));
 assert.throws(()=>addRevenueEvidence(b,{...record('r2'),reconciliation:'settled'},scope,today));
 assert.throws(()=>validateRevenueEvidence({...b,authority:'approved'},scope,today));
 assert.throws(()=>addRevenueEvidence(b,{...record('r2'),sourceLabel:'<script>'},scope,today));
});
test('duplicate identity and repeated source reference are refused',()=>{
 const b=addRevenueEvidence(emptyRevenueEvidence(scope),record(),scope,today);
 assert.throws(()=>addRevenueEvidence(b,record(),scope,today),/REVENUE_EVIDENCE_DUPLICATE_DENIED/);
 assert.throws(()=>addRevenueEvidence(b,{...record('r2'),externalReference:record().externalReference},scope,today),/REVENUE_EVIDENCE_DUPLICATE_DENIED/);
 assert.throws(()=>addRevenueEvidence(b,{...record('r2'),externalReference:record().externalReference,amountMinor:5000,currency:'EUR'},scope,today),/REVENUE_EVIDENCE_DUPLICATE_DENIED/);
 assert.equal(addRevenueEvidence(b,{...record('r2'),externalReference:'Different statement'},scope,today).observations.length,2);
});
test('period, timestamp, amount, scope and future reports fail closed',()=>{
 const b=emptyRevenueEvidence(scope);
 assert.throws(()=>addRevenueEvidence(b,{...record(),websiteId:'site_2'},scope,today),/SCOPE_DENIED/);
 assert.throws(()=>addRevenueEvidence(b,{...record(),amountMinor:-1},scope,today));
 assert.throws(()=>addRevenueEvidence(b,{...record(),amountMinor:NaN},scope,today));
 assert.throws(()=>addRevenueEvidence(b,{...record(),from:'2026-10-02'},scope,today),/PERIOD_DENIED/);
 assert.throws(()=>addRevenueEvidence(b,{...record(),observedOn:'2026-09-29'},scope,today),/PERIOD_DENIED/);
 assert.throws(()=>addRevenueEvidence(b,{...record(),observedOn:'2026-11-01'},scope,today),/PERIOD_DENIED/);
 assert.throws(()=>addRevenueEvidence(b,{...record(),currency:'usd'},scope,today));
});
test('only exactly compatible local report groups are summed, with overflow refusal',()=>{
 let b=addRevenueEvidence(emptyRevenueEvidence(scope),record(),scope,today);
 b=addRevenueEvidence(b,{...record('r2'),amountMinor:2000},scope,today);
 b=addRevenueEvidence(b,{...record('r3'),currency:'EUR',amountMinor:4000},scope,today);
 b=addRevenueEvidence(b,{...record('r4'),basis:'net-reported',amountMinor:5000},scope,today);
 const s=revenueEvidenceSummary(b,scope,today);assert.equal(s.groups.length,3);
 assert.equal(s.groups.find(x=>x.currency==='USD'&&x.basis==='gross-reported')?.amountMinor,3000);
 assert.equal(s.reconciledRevenueMinor,null);assert.ok(s.blockers.includes('Refunds, chargebacks and tax treatment'));
 const large=addRevenueEvidence(emptyRevenueEvidence(scope),{...record(),amountMinor:Number.MAX_SAFE_INTEGER},scope,today);
 assert.throws(()=>revenueEvidenceSummary({...large,observations:[...large.observations,{...record('r2'),amountMinor:1}]},scope,today),/SUM_OVERFLOW/);
});
test('portfolio coverage is tenant safe and never aggregates observed amounts as earnings',()=>{
 const b=addRevenueEvidence(emptyRevenueEvidence(scope),record(),scope,today);
 const rows=portfolioRevenueCoverage([b],scope.organizationId,['site_1','site_2'],today);
 assert.equal(rows[0].observationCount,1);assert.equal(rows[1].observationCount,0);assert.equal(rows[0].actualRevenue,'Unavailable');
 assert.throws(()=>portfolioRevenueCoverage([b],'org_2',['site_1'],today));
 assert.throws(()=>portfolioRevenueCoverage([b],scope.organizationId,['site_2'],today));
 assert.throws(()=>portfolioRevenueCoverage([b,b],scope.organizationId,['site_1'],today));
});
test('bounded export/import round trip refuses malformed, cross-tenant, forged and unsupported packages',()=>{
 const b=addRevenueEvidence(emptyRevenueEvidence(scope),record(),scope,today),wire=exportRevenueEvidence(b,scope,today);
 assert.deepEqual(importRevenueEvidence(new TextEncoder().encode(wire),scope,today),b);
 assert.throws(()=>importRevenueEvidence(new TextEncoder().encode(wire),{...scope,organizationId:'org_2'},today));
 assert.throws(()=>importRevenueEvidence(new TextEncoder().encode(JSON.stringify({...b,version:2})),scope,today));
 assert.throws(()=>importRevenueEvidence(new TextEncoder().encode(JSON.stringify({...b,unknown:'field'})),scope,today));
 assert.throws(()=>importRevenueEvidence(new TextEncoder().encode(JSON.stringify({...b,observations:[{...record(),provenance:'provider-authenticated'}]})),scope,today));
 assert.throws(()=>importRevenueEvidence(new Uint8Array(250001),scope,today),/SIZE_DENIED/);
 assert.throws(()=>importRevenueEvidence(new Uint8Array([255]),scope,today));
});
