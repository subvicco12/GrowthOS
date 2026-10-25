import {test} from 'node:test';import {strict as assert} from 'node:assert';
import {compareCompetitorFeatures,exportCompetitorPackage,exportOpportunityCsv,importCompetitorPackage,productImprovementPreview,validateCompetitorPackage,type CompetitorPackage} from '../local-competitor-workspace';
const scope={organizationId:'org-a',websiteId:'site-a'},today='2026-10-26';
const base:CompetitorPackage={format:'growthos-competitor-preview',version:1,...scope,authority:'local-preview-only',
 competitors:[{id:'comp-a',name:'Comparable product',website:'https://competitor.example/path',category:'tools',positioning:'Unknown positioning',segments:[]}],
 ownFeatures:[{id:'reporting',name:'Reporting',category:'reporting',description:'Reporting capability',availability:'unknown',tiers:[],dependencies:[],effort:'unknown',benefit:'Review customer benefit'}],
 claims:[{id:'claim-a',competitorId:'comp-a',featureId:'reporting',availability:'reported',tiers:['pro','business'],source:'https://competitor.example/path',observedOn:'2026-10-25',claim:'Reporting appears in their Pro plan',pricing:null,evidenceStatus:'unverified-manual',revoked:false}]};
const copy=()=>structuredClone(base);
test('manual comparison keeps unknown own features and unverified competitor tier claims',()=>{
 const result=compareCompetitorFeatures(base,scope,today);assert.equal(result.length,1);assert.equal(result[0].confidence,'low');assert.equal(result[0].impact,'unknown');assert.equal(result[0].cost,'unknown');
 assert.ok(result[0].warning.some(w=>w.includes('unverified')));assert.equal(result[0].priority,3);
 assert.equal(productImprovementPreview(base,[result[0].id],scope,today).approval,'not-requested');
 assert.throws(()=>productImprovementPreview(base,['other'],scope,today),/SELECTION_DENIED/);
});
test('stale, conflicting and revoked claims never gain priority or authority',()=>{
 const p=copy();p.claims[0].observedOn='2025-01-01';p.claims.push({...p.claims[0],id:'claim-b',availability:'limited',observedOn:today});
 const o=compareCompetitorFeatures(p,scope,today)[0];assert.ok(o.warning.length>=2);assert.ok(o.priority<=3);
 p.claims.forEach(c=>c.revoked=true);assert.deepEqual(compareCompetitorFeatures(p,scope,today),[]);
 p.claims[0].revoked=false;p.ownFeatures[0].availability='verified-live';assert.deepEqual(compareCompetitorFeatures(p,scope,today),[]);
});
test('strict bounded round trip, scope, broken references, duplicates and forged verification refused',()=>{
 const bytes=new TextEncoder().encode(exportCompetitorPackage(base,scope,today));assert.deepEqual(importCompetitorPackage(bytes,scope,today),base);
 assert.throws(()=>importCompetitorPackage(bytes,{...scope,websiteId:'site-b'},today),/SCOPE_DENIED/);
 assert.throws(()=>importCompetitorPackage(new Uint8Array(400001),scope,today),/SIZE_DENIED/);
 assert.throws(()=>validateCompetitorPackage({...base,version:2},scope,today));
 assert.throws(()=>validateCompetitorPackage({...base,approval:'approved'},scope,today));
 assert.throws(()=>validateCompetitorPackage({...base,claims:[{...base.claims[0],evidenceStatus:'verified'}]},scope,today));
 assert.throws(()=>validateCompetitorPackage({...base,claims:[base.claims[0],base.claims[0]]},scope,today),/DUPLICATE_ID/);
 assert.throws(()=>validateCompetitorPackage({...base,claims:[{...base.claims[0],competitorId:'other'}]},scope,today),/CLAIM_DENIED/);
 assert.throws(()=>validateCompetitorPackage({...base,claims:[{...base.claims[0],observedOn:'2027-01-01'}]},scope,today),/CLAIM_DENIED/);
 assert.throws(()=>validateCompetitorPackage({...base,competitors:[{...base.competitors[0],name:'<script>alert(1)</script>'}]},scope,today));
 assert.throws(()=>validateCompetitorPackage({...base,ownFeatures:[{...base.ownFeatures[0],dependencies:['missing']}]},scope,today),/REFERENCE_DENIED/);
});
test('pricing and unknown tier claims require valid explicit evidence',()=>{
 assert.throws(()=>validateCompetitorPackage({...base,claims:[{...base.claims[0],pricing:{currency:'US$',minor:100,period:'month'}}]},scope,today));
 assert.throws(()=>validateCompetitorPackage({...base,claims:[{...base.claims[0],availability:'unknown',tiers:['pro']}]},scope,today),/CLAIM_DENIED/);
 assert.throws(()=>validateCompetitorPackage({...base,claims:[{...base.claims[0],source:'http://example.com'}]},scope,today));
});
test('safe CSV neutralizes formula-shaped feature names',()=>{
 const p=copy();p.ownFeatures[0].name='=HYPERLINK("x")';assert.ok(exportOpportunityCsv(p,scope,today).includes('"\'=HYPERLINK'));
 const valid=exportOpportunityCsv(base,scope,today);assert.ok(valid.includes('Reporting'));assert.ok(valid.includes('claim-a'));
});
test('portfolio reuse is scoped and advisory',async()=>{
 const {portfolioReuseCandidates}=await import('../local-competitor-workspace');
 const second=copy();second.websiteId='site-b';
 const r=portfolioReuseCandidates([base,second],'org-a',today);assert.deepEqual(r[0].websiteIds,['site-a','site-b']);assert.equal(r[0].authority,'review-only');
 assert.throws(()=>portfolioReuseCandidates([base,{...second,organizationId:'org-b'}],'org-a',today),/SCOPE_DENIED/);
 assert.throws(()=>portfolioReuseCandidates([base,base],'org-a',today),/DUPLICATE_SITE/);
});
