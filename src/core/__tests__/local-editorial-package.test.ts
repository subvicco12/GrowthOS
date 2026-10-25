import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { prepareLocalPlan } from '../local-growth-plan';
import type { Campaign,ContentDraft } from '../local-campaign-studio';
import { compareLocalRevisions,editLocalDraft,exportLocalPackage,makeLocalDraft,markLocalReview,previewLocalImport,undoLocalDraft } from '../local-editorial-package';
const plan=prepareLocalPlan({organizationId:'org-a',websiteId:'site-a'},[{category:'seo',title:'Fix title',rationale:'Manual observation',
 evidenceUrl:'https://site.example/page'}],['org-a:site-a:0'],'Growth plan');
const d:ContentDraft={id:'550e8400-e29b-41d4-a716-446655440000',organizationId:'org-a',websiteId:'site-a',ideaId:plan.ideas[0].id,
 type:'blog',channel:'website',objective:'seo',title:'First title',audience:'Visitors',primaryKeyword:'topic',secondaryKeywords:[],
 searchIntent:'informational',outline:'Outline',callToAction:'',linkDestination:'',caption:'',hashtags:[],creativeBrief:'',
 scenes:'',voiceover:'',captions:'',thumbnailBrief:'',editorialNotes:'Check rights',proposedDate:'',reviewDeadline:'2026-11-01',
 evidence:'unverified-manual'};
const campaign:Campaign={id:'550e8400-e29b-41d4-a716-446655440001',organizationId:'org-a',websiteId:'site-a',title:'SEO',
 objective:'seo',contentIds:[d.id],priority:'normal',budgetMinor:null,currency:null,expectedImpact:'unknown',state:'local-preview'};
const bytes=(s:string)=>new TextEncoder().encode(s);
function canonical(value:unknown):string{if(value===null||typeof value!=='object')return JSON.stringify(value);
 if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';return '{'+Object.entries(value).sort(([a],[b])=>a<b?-1:a>b?1:0)
 .map(([k,v])=>JSON.stringify(k)+':'+canonical(v)).join(',')+'}';}
async function forge(json:string,change:(body:Record<string,any>)=>void){const {sha256:_,...body}=JSON.parse(json);change(body);
 const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonical(body)));
 return bytes(JSON.stringify({...body,sha256:Array.from(new Uint8Array(hash),v=>v.toString(16).padStart(2,'0')).join('')}));}
test('local revisions edit, compare and undo as a new revision',()=>{
 const one=makeLocalDraft(d,plan,'2026-10-25T00:00:00.000Z');
 const two=editLocalDraft(one,{title:'Updated title',outline:'New outline'},1,plan,'2026-10-25T00:01:00.000Z');
 assert.equal(two.revisions.at(-1)?.number,2);assert.deepEqual(compareLocalRevisions(two,1,2),['title','outline']);
 const three=undoLocalDraft(two,2,plan,'2026-10-25T00:02:00.000Z');
 assert.equal(three.current.title,'First title');assert.equal(three.revisions.length,3);
 assert.throws(()=>editLocalDraft(two,{title:'stale'},1,plan,'2026-10-25T00:03:00.000Z'),/LOCAL_REVISION_CONFLICT/);
 assert.throws(()=>editLocalDraft(two,{websiteId:'site-b'},2,plan,'2026-10-25T00:03:00.000Z'),/LOCAL_EDIT_FIELD_DENIED/);
 assert.throws(()=>editLocalDraft(two,{title:'<script>alert(1)</script>'},2,plan,'2026-10-25T00:03:00.000Z'),/PACKAGE_ACTIVE_CONTENT_DENIED/);
 assert.throws(()=>markLocalReview(makeLocalDraft({...d,outline:''},plan,'2026-10-25T00:00:00.000Z'),
  'ready-for-editorial-review',plan),/LOCAL_REVIEW_NOT_READY/);
});
test('import refuses well-digested unknown fields, authority injection, broken revisions and stale references',async()=>{
 const entry=makeLocalDraft(d,plan,'2026-10-25T00:00:00.000Z');
 const json=await exportLocalPackage(plan,[entry],[campaign],'2026-10-25T00:01:00.000Z');
 await assert.rejects(previewLocalImport(await forge(json,b=>{b.drafts[0].current.published=true;}),plan));
 await assert.rejects(previewLocalImport(await forge(json,b=>{b.authority='approved';}),plan));
 await assert.rejects(previewLocalImport(await forge(json,b=>{b.drafts[0].current.ideaId='stale';b.drafts[0].revisions[0].snapshot.ideaId='stale';}),plan),/STUDIO_SCOPE_DENIED/);
 await assert.rejects(previewLocalImport(await forge(json,b=>{b.drafts[0].revisions[0].number=2;}),plan),/PACKAGE_REVISION_DENIED/);
 await assert.rejects(previewLocalImport(await forge(json,b=>{b.drafts.push(b.drafts[0]);}),plan),/PACKAGE_DUPLICATE_ID/);
 await assert.rejects(previewLocalImport(await forge(json,b=>{b.drafts[0].current.outline='<script>alert(1)</script>';}),plan),/PACKAGE_ACTIVE_CONTENT_DENIED/);
 await assert.rejects(previewLocalImport(await forge(json,b=>{b.version=2;}),plan));
 await assert.rejects(previewLocalImport(await forge(json,b=>{b.campaigns[0].contentIds=['550e8400-e29b-41d4-a716-446655440002'];}),plan),/CAMPAIGN_SCOPE_DENIED/);
 await assert.rejects(previewLocalImport(await forge(json,b=>{let p=b;for(let i=0;i<15;i++){p.extra={};p=p.extra;}}),plan));
});
test('strict export/import round trip, untrusted approvals and scope refusal',async()=>{
 const entry=editLocalDraft(makeLocalDraft(d,plan,'2026-10-25T00:00:00.000Z'),{title:'Updated'},1,plan,'2026-10-25T00:01:00.000Z');
 const json=await exportLocalPackage(plan,[entry],[campaign],'2026-10-25T00:02:00.000Z');
 const imported=await previewLocalImport(bytes(json),plan);
 assert.deepEqual(imported.summary,{drafts:1,campaigns:1,revisions:2,unscheduled:1});
 assert.equal(imported.body.authority,'none');assert.equal(imported.body.drafts[0].current.title,'Updated');
 await assert.rejects(previewLocalImport(bytes(json.replace('Updated','Tampered')),plan),/PACKAGE_DIGEST_MISMATCH/);
 await assert.rejects(previewLocalImport(bytes(json),{...plan,websiteId:'site-b'}),/PACKAGE_SCOPE_OR_STALE_PLAN/);
 await assert.rejects(previewLocalImport(bytes(json),{...plan,title:'Different plan'}),/PACKAGE_SCOPE_OR_STALE_PLAN/);
 await assert.rejects(previewLocalImport(new Uint8Array(2_000_001),plan),/PACKAGE_SIZE_DENIED/);
 await assert.rejects(previewLocalImport(bytes('{'),plan),SyntaxError);
 await assert.rejects(previewLocalImport(bytes(JSON.stringify({...JSON.parse(json),version:2})),plan),/PACKAGE_DIGEST_MISMATCH/);
});
test('export refuses duplicate IDs, broken campaigns, injected approval and unsafe drafts',async()=>{
 const one=makeLocalDraft(d,plan,'2026-10-25T00:00:00.000Z');
 await assert.rejects(exportLocalPackage(plan,[one,one],[],'2026-10-25T00:00:00.000Z'),/PACKAGE_DUPLICATE_ID/);
 await assert.rejects(exportLocalPackage(plan,[one],[{...campaign,contentIds:['550e8400-e29b-41d4-a716-446655440002']}],
  '2026-10-25T00:00:00.000Z'),/CAMPAIGN_SCOPE_DENIED/);
 await assert.rejects(exportLocalPackage(plan,[{...one,review:'approved' as typeof one.review}],[],
  '2026-10-25T00:00:00.000Z'));
 await assert.rejects(exportLocalPackage(plan,[{...one,current:{...d,outline:'<img src=x onerror=alert(1)>'}}],[],
  '2026-10-25T00:00:00.000Z'),/PACKAGE_ACTIVE_CONTENT_DENIED|PACKAGE_REVISION_DENIED/);
});
