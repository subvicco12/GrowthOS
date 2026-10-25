import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { prepareContentBrief, prepareLocalPlan, type DraftChannel } from '../local-growth-plan';

const scope={organizationId:'org-a',websiteId:'site-a'};
const items=[
  {category:'feature_review' as const,title:'Compare Business tier',rationale:'Reported package difference',evidenceUrl:'https://example.org/pricing'},
  {category:'seo' as const,title:'Repair title',rationale:'Title missing in supplied observation',evidenceUrl:'https://site.example/page'}
];
const ids=items.map((_,i)=>`org-a:site-a:${i}`);
test('planning orders scoped manual ideas but cannot claim saved approval, costs or impact',()=>{
  const plan=prepareLocalPlan(scope,items,ids,'Improve site');
  assert.deepEqual(plan.ideas.map(i=>i.id),[ids[1],ids[0]]);
  assert.equal(plan.persistence,'none');assert.equal(plan.approval,'not-requested');
  assert.equal(plan.estimatedCost,'unknown');assert.ok(plan.ideas.every(i=>i.impact==='unestimated'));
  for(const channel of ['blog','landing_page','seo_metadata','social','video_script','youtube_plan','instagram_plan','email'] as DraftChannel[]){
    const brief=prepareContentBrief(plan,ids[1],channel);
    assert.equal(brief.publication,'disabled');assert.equal(brief.state,'unsaved-local-outline');
    assert.ok(brief.checklist.includes('Request human approval before scheduling'));
  }
});
test('rejects cross-website selection, unsafe evidence, duplicates and forged draft channel',()=>{
  assert.throws(()=>prepareLocalPlan(scope,items,['org-b:site-a:0'],'Plan'),/PLAN_SCOPE_DENIED/);
  assert.throws(()=>prepareLocalPlan(scope,items,[ids[0],ids[0]],'Plan'),/PLAN_INPUT_DENIED/);
  assert.throws(()=>prepareLocalPlan(scope,[{...items[0],evidenceUrl:'http://127.0.0.1/private'}],[],'Plan'),/PLAN_EVIDENCE_DENIED/);
  assert.throws(()=>prepareLocalPlan(scope,items,ids,'x'),/PLAN_INPUT_DENIED/);
  const plan=prepareLocalPlan(scope,items,[ids[0]],'Plan');
  assert.throws(()=>prepareContentBrief(plan,ids[1],'blog'),/BRIEF_SCOPE_DENIED/);
  assert.throws(()=>prepareContentBrief(plan,ids[0],'publisher' as DraftChannel),/BRIEF_SCOPE_DENIED/);
});
