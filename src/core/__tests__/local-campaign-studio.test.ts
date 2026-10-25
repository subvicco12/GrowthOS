import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { prepareLocalPlan } from '../local-growth-plan';
import { campaignPreview, contentTypes, draftReadiness, type Campaign, type ContentDraft } from '../local-campaign-studio';
const scope={organizationId:'org-a',websiteId:'site-a'};
const idea={category:'seo' as const,title:'Title gap',rationale:'Manual page observation',evidenceUrl:'https://site.example/a'};
const plan=prepareLocalPlan(scope,[idea],['org-a:site-a:0'],'Plan');
const draft:ContentDraft={id:'550e8400-e29b-41d4-a716-446655440000',...scope,ideaId:plan.ideas[0].id,
 type:'blog',channel:'website',objective:'seo',title:'Title gap',audience:'Visitors',primaryKeyword:'topic',secondaryKeywords:[],
 searchIntent:'informational',outline:'Structure',callToAction:'',linkDestination:'',caption:'',hashtags:[],creativeBrief:'',
 scenes:'',voiceover:'',captions:'',thumbnailBrief:'',editorialNotes:'rights review',proposedDate:'2026-11-02',
 reviewDeadline:'2026-11-01',evidence:'unverified-manual'};
const campaign:Campaign={id:'c1',...scope,title:'SEO refresh',objective:'seo',contentIds:[draft.id],priority:'normal',
 budgetMinor:null,currency:null,expectedImpact:'unknown',state:'local-preview'};
test('all content types have a bounded schema and no draft can become approved',()=>{
 assert.equal(contentTypes.length,13);
 const r=draftReadiness(draft,plan);assert.equal(r.state,'ready-for-editorial-review');
 assert.ok(r.warnings.some(w=>w.includes('unverified')));
 for(const type of contentTypes){const channel=type.startsWith('youtube')?'youtube':type==='instagram_reel'?'instagram':
  type==='video_script'?'youtube':type==='social_post'?'facebook':type==='email_campaign'?'email':'website';
  assert.doesNotThrow(()=>draftReadiness({...draft,type,channel},plan));}
 assert.throws(()=>draftReadiness({...draft,organizationId:'org-b'},plan),/STUDIO_SCOPE_DENIED/);
 assert.throws(()=>draftReadiness({...draft,ideaId:'stale'},plan),/STUDIO_SCOPE_DENIED/);
 assert.throws(()=>draftReadiness({...draft,channel:'email'},plan),/STUDIO_CHANNEL_DENIED/);
 assert.throws(()=>draftReadiness({...draft,proposedDate:'2026-02-30'},plan));
 assert.throws(()=>draftReadiness({...draft,reviewDeadline:'2026-11-03'},plan),/STUDIO_DATE_ORDER_DENIED/);
});
test('social, video, SEO and conversion readiness is evidence-limited',()=>{
 const social=draftReadiness({...draft,type:'instagram_reel',channel:'instagram',caption:'',scenes:'',captions:'',thumbnailBrief:''},plan);
 assert.ok(social.warnings.some(w=>w.includes('Caption missing')));
 assert.ok(social.warnings.some(w=>w.includes('Scene plan')));
 assert.ok(draftReadiness({...draft,type:'landing_page',primaryKeyword:'',callToAction:''},plan).warnings.length>1);
 assert.ok(draftReadiness({...draft,objective:'free_to_pro',linkDestination:''},plan).warnings.some(w=>w.includes('HTTPS destination')));
 assert.throws(()=>draftReadiness({...draft,linkDestination:'http://127.0.0.1'},plan));
});
test('campaign grouping detects conflicts and refuses duplicate, cross-tenant, unknown budget',()=>{
 const second={...draft,id:'550e8400-e29b-41d4-a716-446655440001'};
 const c=campaignPreview(plan,[draft,second],{...campaign,contentIds:[draft.id,second.id]});
 assert.deepEqual(c.conflicts,['2026-11-02']);assert.equal(c.persistence,'none');assert.equal(c.published,false);
 assert.throws(()=>campaignPreview(plan,[draft],{...campaign,contentIds:[draft.id,draft.id]}),/CAMPAIGN_INPUT_DENIED/);
 assert.throws(()=>campaignPreview(plan,[draft],{...campaign,contentIds:['other']}),/CAMPAIGN_SCOPE_DENIED/);
 assert.throws(()=>campaignPreview(plan,[draft],{...campaign,organizationId:'org-b'}),/CAMPAIGN_INPUT_DENIED/);
 assert.throws(()=>campaignPreview(plan,[draft],{...campaign,budgetMinor:10,currency:null}),/CAMPAIGN_INPUT_DENIED/);
});
