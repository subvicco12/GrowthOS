import { z } from 'zod';
import type { LocalPlan } from './local-growth-plan';

export const contentTypes = ['blog','landing_page','seo_metadata','product_description','social_post','instagram_reel',
  'youtube_video','youtube_short','video_script','email_campaign','promotion','announcement','faq'] as const;
export const channels = ['website','instagram','youtube','facebook','linkedin','x','pinterest','email'] as const;
export const objectives = ['seo','conversion','free_to_pro','pro_to_business','affiliate','advertising','lead_generation',
  'launch','retention','upsell','awareness'] as const;
const plain = (max:number) => z.string().trim().max(max);
const required = (max:number) => plain(max).min(1);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v=>{
  const d=new Date(v+'T00:00:00Z');return !Number.isNaN(d.valueOf())&&d.toISOString().slice(0,10)===v;
});
const https = z.string().max(2048).refine(v=>{try{const u=new URL(v);return u.protocol==='https:'&&!u.username&&!u.password&&!u.port;}catch{return false;}});
export const contentDraftSchema = z.object({
  id: z.string().uuid(), organizationId: required(128), websiteId: required(128), ideaId: required(300),
  type: z.enum(contentTypes), channel: z.enum(channels), objective:z.enum(objectives),
  title: required(180), audience:required(180), primaryKeyword:plain(120), secondaryKeywords:z.array(required(120)).max(10),
  searchIntent:z.enum(['unknown','informational','commercial','transactional','navigational']),
  outline:plain(10000), callToAction:plain(500), linkDestination:z.union([https,z.literal('')]),
  caption:plain(2200), hashtags:z.array(required(80)).max(20), creativeBrief:plain(3000),
  scenes:plain(6000), voiceover:plain(6000), captions:plain(3000), thumbnailBrief:plain(1000),
  editorialNotes:plain(3000), proposedDate:z.union([date,z.literal('')]), reviewDeadline:z.union([date,z.literal('')]),
  evidence:z.literal('unverified-manual')
}).strict();
export type ContentDraft=z.infer<typeof contentDraftSchema>;
export type Campaign={id:string;organizationId:string;websiteId:string;title:string;objective:typeof objectives[number];
  contentIds:string[];priority:'low'|'normal'|'high';budgetMinor:null|number;currency:string|null;
  expectedImpact:'unknown';state:'local-preview'};

const channelAllowed:Record<ContentDraft['channel'],readonly ContentDraft['type'][]>= {
  website:['blog','landing_page','seo_metadata','product_description','promotion','announcement','faq'],
  instagram:['social_post','instagram_reel','video_script','promotion'],youtube:['youtube_video','youtube_short','video_script'],
  facebook:['social_post','promotion','announcement'],linkedin:['social_post','promotion','announcement'],
  x:['social_post','promotion','announcement'],pinterest:['social_post','promotion'],email:['email_campaign','promotion','announcement']
};
export function draftReadiness(draft:unknown,plan:LocalPlan):{state:'incomplete'|'ready-for-editorial-review';warnings:string[];draft:ContentDraft}{
  if(plan.persistence!=='none'||plan.approval!=='not-requested')throw Error('STUDIO_AUTHORITY_DENIED');
  const d=contentDraftSchema.parse(draft);
  if(d.organizationId!==plan.organizationId||d.websiteId!==plan.websiteId||!plan.ideas.some(i=>i.id===d.ideaId))throw Error('STUDIO_SCOPE_DENIED');
  if(!channelAllowed[d.channel].includes(d.type))throw Error('STUDIO_CHANNEL_DENIED');
  if(d.reviewDeadline&&d.proposedDate&&d.reviewDeadline>d.proposedDate)throw Error('STUDIO_DATE_ORDER_DENIED');
  const warnings:string[]=[];
  if(!d.outline.trim())warnings.push('Content outline missing');
  if(['blog','landing_page','seo_metadata','faq'].includes(d.type)&&!d.primaryKeyword.trim())warnings.push('Primary keyword missing');
  if(['seo_metadata','landing_page'].includes(d.type)&&!d.callToAction.trim())warnings.push('Call to action missing');
  if(['social_post','instagram_reel','promotion'].includes(d.type)&&!d.caption.trim())warnings.push('Caption missing');
  if(['instagram_reel','youtube_video','youtube_short','video_script'].includes(d.type)){
    if(!d.scenes.trim())warnings.push('Scene plan missing');if(!d.captions.trim())warnings.push('Caption accessibility plan missing');
    if(!d.thumbnailBrief.trim())warnings.push('Thumbnail brief missing');
  }
  if(['email_campaign'].includes(d.type)&&!d.editorialNotes.toLowerCase().includes('consent'))warnings.push('Consent and unsubscribe review missing');
  if(['conversion','free_to_pro','pro_to_business','affiliate','lead_generation','upsell'].includes(d.objective)){
    if(!d.callToAction.trim())warnings.push('Conversion call to action missing');
    if(!d.linkDestination)warnings.push('HTTPS destination missing');
  }
  if(!d.reviewDeadline)warnings.push('Editorial deadline missing');
  warnings.push('Source evidence unverified; independent validation and rights review required');
  return {state:warnings.length===1?'ready-for-editorial-review':'incomplete',warnings,draft:d};
}

export function campaignPreview(plan:LocalPlan,drafts:ContentDraft[],campaign:Campaign){
  if(plan.persistence!=='none'||campaign.organizationId!==plan.organizationId||campaign.websiteId!==plan.websiteId||
    !campaign.title.trim()||campaign.title.length>180||!objectives.includes(campaign.objective)||
    !['low','normal','high'].includes(campaign.priority)||campaign.state!=='local-preview'||campaign.expectedImpact!=='unknown'||
    campaign.contentIds.length>30||new Set(campaign.contentIds).size!==campaign.contentIds.length||
    (campaign.budgetMinor!==null&&(!Number.isSafeInteger(campaign.budgetMinor)||campaign.budgetMinor<0||
      !/^[A-Z]{3}$/.test(campaign.currency??'')))||
    (campaign.budgetMinor===null&&campaign.currency!==null))throw Error('CAMPAIGN_INPUT_DENIED');
  const selected=campaign.contentIds.map(id=>drafts.find(d=>d.id===id));
  if(selected.some(d=>!d))throw Error('CAMPAIGN_SCOPE_DENIED');
  const checks=selected.map(d=>draftReadiness(d!,plan));
  const dates=new Map<string,number>();for(const d of selected){if(d!.proposedDate)dates.set(d!.proposedDate,(dates.get(d!.proposedDate)??0)+1);}
  return { ...campaign, contentCount:selected.length,unscheduled:selected.filter(d=>!d!.proposedDate).length,
    conflicts:[...dates].filter(([,n])=>n>1).map(([day])=>day),
    warnings:[...(selected.length?[]:['No content selected']),...checks.flatMap((c,i)=>c.warnings.map(w=>`${selected[i]!.title}: ${w}`)),
      'Budget and impact are estimates or unknown; no spending authority is checked'],
    approval:'not-requested' as const,scheduled:false as const,published:false as const,persistence:'none' as const};
}
