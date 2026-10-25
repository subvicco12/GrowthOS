import { z } from 'zod';
import { campaignPreview, contentDraftSchema, draftReadiness, objectives, type Campaign, type ContentDraft } from './local-campaign-studio';
import type { LocalPlan } from './local-growth-plan';

export type LocalRevision={number:number;at:string;changed:string[];snapshot:ContentDraft};
export type LocalEditorialDraft={current:ContentDraft;revisions:LocalRevision[];review:'in-preparation'|'needs-information'|'ready-for-editorial-review'|'changes-requested-locally'};
type PackageBody={format:'growthos-local-editorial';version:1;exportedAt:string;organizationId:string;websiteId:string;
  plan:LocalPlan;drafts:LocalEditorialDraft[];campaigns:Campaign[];authority:'none';persistence:'none'};
export type ImportPreview={body:PackageBody;summary:{drafts:number;campaigns:number;revisions:number;unscheduled:number}};
const maxBytes=2_000_000;
const time=z.string().datetime({offset:true});
const revisionSchema=z.object({number:z.number().int().min(1).max(20),at:time,changed:z.array(z.string().min(1).max(40)).max(30),snapshot:contentDraftSchema}).strict();
const editorialSchema=z.object({current:contentDraftSchema,revisions:z.array(revisionSchema).min(1).max(20),review:z.enum([
  'in-preparation','needs-information','ready-for-editorial-review','changes-requested-locally'])}).strict();
const campaignSchema=z.object({id:z.string().uuid(),organizationId:z.string().min(1).max(128),websiteId:z.string().min(1).max(128),
  title:z.string().min(1).max(180),objective:z.enum(objectives),contentIds:z.array(z.string().uuid()).max(30),
  priority:z.enum(['low','normal','high']),budgetMinor:z.number().int().nonnegative().safe().nullable(),currency:z.string().regex(/^[A-Z]{3}$/).nullable(),
  expectedImpact:z.literal('unknown'),state:z.literal('local-preview')}).strict();
const recommendationSchema=z.object({category:z.enum(['seo','content','conversion','feature_review']),title:z.string().min(1).max(200),
  rationale:z.string().min(1).max(2000),evidenceUrl:z.string().url().max(2048),id:z.string().min(1).max(300),
  priority:z.number().int().min(1).max(5),evidence:z.literal('unverified-manual'),effort:z.literal('unestimated'),
  cost:z.literal('unknown'),impact:z.literal('unestimated'),status:z.literal('local-preview')}).strict();
const planSchema=z.object({organizationId:z.string().min(1).max(128),websiteId:z.string().min(1).max(128),title:z.string().min(3).max(120),
  ideas:z.array(recommendationSchema).min(1).max(20),dependencies:z.array(z.string().max(200)).max(10),
  estimatedCost:z.literal('unknown'),approval:z.literal('not-requested'),persistence:z.literal('none')}).strict();
const bodySchema=z.object({format:z.literal('growthos-local-editorial'),version:z.literal(1),exportedAt:time,
  organizationId:z.string().min(1).max(128),websiteId:z.string().min(1).max(128),plan:planSchema,
  drafts:z.array(editorialSchema).max(30),campaigns:z.array(campaignSchema).max(10),authority:z.literal('none'),persistence:z.literal('none')}).strict();

function canonical(value:unknown):string{
  if(value===null||typeof value!=='object')return JSON.stringify(value);
  if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
  return '{'+Object.entries(value).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([k,v])=>JSON.stringify(k)+':'+canonical(v)).join(',')+'}';
}
async function digest(value:unknown){const bytes=new TextEncoder().encode(canonical(value));const buffer=await crypto.subtle.digest('SHA-256',bytes);
  return Array.from(new Uint8Array(buffer),x=>x.toString(16).padStart(2,'0')).join('');}
function safeText(value:unknown,depth=0):void{
  if(depth>12)throw Error('PACKAGE_DEPTH_DENIED');
  if(typeof value==='string'&&(/<\s*\/?\s*[a-z!]/i.test(value)||/javascript\s*:/i.test(value)||/data\s*:\s*text\/html/i.test(value)))
    throw Error('PACKAGE_ACTIVE_CONTENT_DENIED');
  if(value&&typeof value==='object')for(const [key,item] of Object.entries(value)){
    if(['__proto__','prototype','constructor'].includes(key))throw Error('PACKAGE_FIELD_DENIED');safeText(item,depth+1);
  }
}
export function makeLocalDraft(draft:ContentDraft,plan:LocalPlan,at:string):LocalEditorialDraft{
  draftReadiness(draft,plan);time.parse(at);safeText(draft);
  return {current:structuredClone(draft),revisions:[{number:1,at,changed:['created'],snapshot:structuredClone(draft)}],review:'in-preparation'};
}
const editable=new Set(Object.keys(contentDraftSchema.shape).filter(k=>!['id','organizationId','websiteId','ideaId','evidence'].includes(k)));
export function editLocalDraft(entry:LocalEditorialDraft,patch:Partial<ContentDraft>,expectedRevision:number,plan:LocalPlan,at:string):LocalEditorialDraft{
  time.parse(at);if(entry.revisions.at(-1)?.number!==expectedRevision||expectedRevision>=20)throw Error('LOCAL_REVISION_CONFLICT');
  const keys=Object.keys(patch);if(!keys.length||keys.some(k=>!editable.has(k)))throw Error('LOCAL_EDIT_FIELD_DENIED');
  const current=contentDraftSchema.parse(entry.current);const next=contentDraftSchema.parse({...current,...patch});draftReadiness(next,plan);safeText(next);
  const changed=keys.filter(k=>canonical(current[k as keyof ContentDraft])!==canonical(next[k as keyof ContentDraft]));
  if(!changed.length)throw Error('LOCAL_NO_CHANGE');
  if(Date.parse(at)<Date.parse(entry.revisions.at(-1)!.at))throw Error('LOCAL_REVISION_CLOCK_DENIED');
  return {current:next,revisions:[...entry.revisions,{number:expectedRevision+1,at,changed,snapshot:structuredClone(next)}],review:'in-preparation'};
}
export function compareLocalRevisions(entry:LocalEditorialDraft,left:number,right:number){
  const a=entry.revisions.find(r=>r.number===left),b=entry.revisions.find(r=>r.number===right);
  if(!a||!b)throw Error('LOCAL_REVISION_MISSING');
  return Object.keys(contentDraftSchema.shape).filter(k=>canonical(a.snapshot[k as keyof ContentDraft])!==canonical(b.snapshot[k as keyof ContentDraft]));
}
export function undoLocalDraft(entry:LocalEditorialDraft,expectedRevision:number,plan:LocalPlan,at:string){
  if(entry.revisions.length<2||entry.revisions.at(-1)?.number!==expectedRevision)throw Error('LOCAL_REVISION_CONFLICT');
  const previous=entry.revisions.at(-2)!.snapshot,patch=Object.fromEntries([...editable].map(k=>[k,previous[k as keyof ContentDraft]]));
  return editLocalDraft(entry,patch,expectedRevision,plan,at);
}
export function markLocalReview(entry:LocalEditorialDraft,state:LocalEditorialDraft['review'],plan:LocalPlan):LocalEditorialDraft{
  draftReadiness(entry.current,plan);
  if(!['in-preparation','needs-information','ready-for-editorial-review','changes-requested-locally'].includes(state)||
    (state==='ready-for-editorial-review'&&draftReadiness(entry.current,plan).state!=='ready-for-editorial-review'))
    throw Error('LOCAL_REVIEW_NOT_READY');
  return {...entry,review:state};
}
function validateBody(input:unknown,scope:LocalPlan):PackageBody{
  const body=bodySchema.parse(input);
  safeText(body);
  if(body.organizationId!==scope.organizationId||body.websiteId!==scope.websiteId||
    body.plan.organizationId!==scope.organizationId||body.plan.websiteId!==scope.websiteId||
    canonical(body.plan)!==canonical(scope))throw Error('PACKAGE_SCOPE_OR_STALE_PLAN');
  if(new Set(body.drafts.map(d=>d.current.id)).size!==body.drafts.length||
    new Set(body.campaigns.map(c=>c.id)).size!==body.campaigns.length)throw Error('PACKAGE_DUPLICATE_ID');
  for(const item of body.drafts){
    const d=item.current;draftReadiness(d,scope);safeText(item);
    for(let i=0;i<item.revisions.length;i++){
      const r=item.revisions[i];if(r.number!==i+1||r.snapshot.id!==d.id||r.snapshot.organizationId!==d.organizationId||
        r.snapshot.websiteId!==d.websiteId||r.snapshot.ideaId!==d.ideaId||
        (i>0&&Date.parse(r.at)<Date.parse(item.revisions[i-1].at)))throw Error('PACKAGE_REVISION_DENIED');
      draftReadiness(r.snapshot,scope);
      if(i>0){const changes=compareLocalRevisions(item,i,i+1);
        if(canonical(changes.sort())!==canonical([...r.changed].sort())||changes.some(k=>!editable.has(k)))throw Error('PACKAGE_REVISION_DENIED');}
      else if(canonical(r.changed)!==canonical(['created']))throw Error('PACKAGE_REVISION_DENIED');
    }
    if(canonical(item.revisions.at(-1)!.snapshot)!==canonical(d))throw Error('PACKAGE_REVISION_DENIED');
    if(item.review==='ready-for-editorial-review'&&draftReadiness(d,scope).state!=='ready-for-editorial-review')throw Error('PACKAGE_REVIEW_DENIED');
  }
  const drafts=body.drafts.map(d=>d.current);for(const c of body.campaigns){campaignPreview(scope,drafts,c);safeText(c);}
  return body;
}
export async function exportLocalPackage(scope:LocalPlan,drafts:LocalEditorialDraft[],campaigns:Campaign[],at:string):Promise<string>{
  const body:PackageBody={format:'growthos-local-editorial',version:1,exportedAt:time.parse(at),organizationId:scope.organizationId,
    websiteId:scope.websiteId,plan:scope,drafts,campaigns,authority:'none',persistence:'none'};
  validateBody(body,scope);const envelope={...body,sha256:await digest(body)};const serialized=JSON.stringify(envelope);
  if(new TextEncoder().encode(serialized).length>maxBytes)throw Error('PACKAGE_SIZE_DENIED');return serialized;
}
export async function previewLocalImport(bytes:Uint8Array,scope:LocalPlan):Promise<ImportPreview>{
  if(bytes.length>maxBytes||bytes.length===0)throw Error('PACKAGE_SIZE_DENIED');
  const raw=new TextDecoder('utf-8',{fatal:true}).decode(bytes);const value=JSON.parse(raw) as unknown;
  if(!value||typeof value!=='object'||Array.isArray(value))throw Error('PACKAGE_FORMAT_DENIED');
  const fields=Object.keys(value);if(fields.length!==Object.keys(bodySchema.shape).length+1||!fields.includes('sha256'))throw Error('PACKAGE_FIELD_DENIED');
  const {sha256,...rest}=value as Record<string,unknown>;
  if(typeof sha256!=='string'||!/^[a-f0-9]{64}$/.test(sha256)||sha256!==await digest(rest))throw Error('PACKAGE_DIGEST_MISMATCH');
  const body=validateBody(rest,scope);
  return {body,summary:{drafts:body.drafts.length,campaigns:body.campaigns.length,
    revisions:body.drafts.reduce((n,d)=>n+d.revisions.length,0),unscheduled:body.drafts.filter(d=>!d.current.proposedDate).length}};
}
