import {test} from 'node:test';import {strict as assert} from 'node:assert';
import {assessProductReadiness,developmentHandoff,emptyBacklog,exportBacklog,fromCompetitorOpportunity,HANDOFF_WARNING,importBacklog,validateBacklog,type ProductProposal} from '../local-product-backlog';
import {compareCompetitorFeatures,type CompetitorPackage} from '../local-competitor-workspace';
const scope={organizationId:'org-a',websiteId:'site-a'};
const base:ProductProposal={id:'proposal-a',...scope,origin:'manual',title:'Improve reporting',problem:'Customers cannot export reports',solution:'Prepare reporting export proposal',benefit:'Customers can review their data',evidenceRefs:[],targetTiers:['pro'],usageLimit:null,effort:'unknown',estimatedCostMinor:null,currency:null,dependencies:[],featureChange:'none',featureKey:null,requirements:[],acceptance:[],security:'',privacy:'',tests:'',rollback:'',rollout:'',requiredRole:'owner',state:'local-review-only'};
const pkg=(items:ProductProposal[]=[])=>({...emptyBacklog(scope),proposals:items});
test('competitor opportunity converts with claim IDs, unknown cost and no authority',()=>{
 const cp:CompetitorPackage={format:'growthos-competitor-preview',version:1,...scope,authority:'local-preview-only',competitors:[{id:'comp',name:'Competitor',website:'https://example.com',category:'product',positioning:'Unknown position',segments:[]}],ownFeatures:[{id:'export',category:'export',name:'Data export',description:'Customer data export',availability:'unknown',tiers:[],dependencies:[],effort:'unknown',benefit:'Customer ownership'}],claims:[{id:'claim',competitorId:'comp',featureId:'export',availability:'reported',tiers:['pro'],source:'https://example.com',observedOn:'2026-10-25',claim:'Reports available on Pro',pricing:null,evidenceStatus:'unverified-manual',revoked:false}]};
 const o=compareCompetitorFeatures(cp,scope,'2026-10-26')[0],p=fromCompetitorOpportunity(o,scope);
 assert.deepEqual(p.evidenceRefs,['claim']);assert.equal(p.estimatedCostMinor,null);assert.equal(p.state,'local-review-only');
 assert.throws(()=>fromCompetitorOpportunity(o,{...scope,websiteId:'other'}),/SCOPE_DENIED/);
});
test('strict scope, duplicate, dependency and cycle rejection',()=>{
 assert.throws(()=>validateBacklog(pkg([{...base,organizationId:'other'}]),scope),/SCOPE_DENIED/);
 assert.throws(()=>validateBacklog(pkg([base,base]),scope),/DUPLICATE_ID/);
 assert.throws(()=>validateBacklog(pkg([{...base,dependencies:['absent']}]),scope),/REFERENCE_DENIED/);
 assert.throws(()=>validateBacklog(pkg([{...base,dependencies:['proposal-a']}]),scope),/REFERENCE_DENIED/);
 const other={...base,id:'proposal-b',dependencies:['proposal-a']};
 assert.throws(()=>validateBacklog(pkg([{...base,dependencies:['proposal-b']},other]),scope),/DEPENDENCY_CYCLE/);
 assert.throws(()=>validateBacklog(pkg([{...base,state:'approved' as never}]),scope));
 assert.throws(()=>validateBacklog({...pkg(),authority:'approved'},scope));
 assert.throws(()=>validateBacklog(pkg([{...base,featureChange:'enable',featureKey:null}]),scope),/REFERENCE_DENIED/);
});
test('review readiness is advisory and feature state unavailable blocks review',()=>{
 const filled={...base,evidenceRefs:['claim'],effort:'medium' as const,estimatedCostMinor:100,currency:'USD',requirements:['Export user data'],acceptance:['Download usable report'],security:'Review access control',privacy:'Limit personal data',tests:'Cross tenant test',rollback:'Disable export safely',rollout:'Manual pilot',featureChange:'enable' as const,featureKey:'automation'};
 assert.equal(assessProductReadiness(filled,scope,'unavailable').readyForReview,false);
 assert.ok(assessProductReadiness(filled,scope,'unavailable').blockers.some(x=>x.includes('unavailable')));
 assert.equal(assessProductReadiness(filled,scope,'disabled').readyForReview,true); // review readiness grants no authority
 assert.equal(assessProductReadiness(filled,scope,'disabled').authorized,false);
 assert.throws(()=>assessProductReadiness(filled,{...scope,websiteId:'other'},'disabled'),/SCOPE_DENIED/);
});
test('bounded import/export, forged state and Markdown handoff',()=>{
 const wire=new TextEncoder().encode(exportBacklog(pkg([base]),scope));assert.deepEqual(importBacklog(wire,scope).proposals,[base]);
 assert.throws(()=>importBacklog(wire,{...scope,organizationId:'other'}),/SCOPE_DENIED/);
 assert.throws(()=>importBacklog(new Uint8Array(250001),scope),/SIZE_DENIED/);
 assert.throws(()=>importBacklog(new TextEncoder().encode(JSON.stringify({...pkg([base]),version:2})),scope));
 const md=developmentHandoff(base,scope,'unavailable');assert.equal(md.split(HANDOFF_WARNING).length,3);assert.ok(md.includes('Cost: unknown'));
 assert.throws(()=>developmentHandoff({...base,title:'<script>'},scope,'unknown'));
});
