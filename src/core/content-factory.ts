/** Versioned orchestration contract. No network, AI execution, publication or implicit persistence. */
import {createHash} from 'node:crypto';
import {z} from 'zod';
import {createContentRecord,transitionContent,type ContentRecord,type ContentActor} from './content-lifecycle';
const id=z.string().regex(/^[A-Za-z0-9_-]{1,128}$/),hash=z.string().regex(/^[a-f0-9]{64}$/),time=z.string().datetime();
const text=(max:number)=>z.string().trim().min(1).max(max);
const https=z.string().max(2048).refine(value=>{try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&!u.hash&&u.href===value;}catch{return false;}});
export const researchSourceSchema=z.object({id,url:https,claim:text(1000),observedAt:time,expiresAt:time,snapshotHash:hash,verificationId:id}).strict();
export const contentBriefSchema=z.object({topic:text(300),audience:text(1000),objective:text(1000),language:text(80),requiredDisclosures:z.array(text(1000)).max(10),assetIds:z.array(id).min(1).max(100)}).strict();
export const rightsSchema=z.object({assetId:id,owner:text(300),license:text(300),proofHash:hash,permittedUses:z.array(z.enum(['draft','publication'])).min(1).max(2),attributionRequired:z.boolean(),attribution:z.string().max(1000)}).strict();
export const qualityReportSchema=z.object({
 id,issuer:id,reviewedHash:hash,checkedAt:time,expiresAt:time,
 factual:z.array(z.object({sourceId:id,claimHash:hash,result:z.enum(['pass','fail','unavailable'])}).strict()).min(1).max(30),
 originality:z.object({result:z.enum(['pass','fail','unavailable']),method:text(200),corpusHash:hash,reportHash:hash}).strict(),
 rights:z.array(rightsSchema).min(1).max(100),
 disclosure:z.object({checked:z.boolean(),required:z.boolean(),text:z.string().max(2000)}).strict(),
 regulatedReview:z.object({reviewerId:id,qualification:text(300),reportHash:hash,reviewedHash:hash,reviewedAt:time}).strict().nullable()
}).strict();
export type ResearchSource=z.infer<typeof researchSourceSchema>;
export type ContentBrief=z.infer<typeof contentBriefSchema>;
export type FactoryQualityReport=z.infer<typeof qualityReportSchema>;
export interface FactoryEnvelope {
 schemaVersion:1; record:ContentRecord; brief:ContentBrief|null; research:ResearchSource[];
 quality:FactoryQualityReport|null; humanApproval:{actorId:string;reviewedHash:string;qualityId:string;at:string}|null;
 /** The adapter must persist this scoped journal atomically with the record and metadata. */
 journal:readonly {eventId:string;commandHash:string;actorId:string;operation:string;at:string;version:number}[];
}
export interface FactoryContext {sessionHash:string;organizationId:string}
export interface FactoryScope {organizationId:string;websiteId:string;contentId:string}
export interface FactoryPrincipal extends ContentActor {checkedAt:string;expiresAt:string;sessionExpiresAt:string;regulated:boolean;policyRevision:string;requiredDisclosures:string[]}
export interface FactoryTransaction {
 /** Must derive identity/current membership from the session, check website ownership and lock current policy. */
 authenticate(context:FactoryContext,scope:FactoryScope,at:string):Promise<FactoryPrincipal>;
 load(scope:FactoryScope):Promise<FactoryEnvelope|null>;
 /** Trusted verifier resolves source/QA issuer evidence and revocation; no default allow implementation. */
 verifyEvidence(kind:'source'|'quality',evidence:ResearchSource|FactoryQualityReport,binding:{scope:FactoryScope;reviewedHash:string;at:string;regulated:boolean}):Promise<void>;
 /** Recheck session, policy and evidence revocation at commit; failure rolls back journal and content. */
 /** Revision/cancel must atomically invalidate linked unclaimed jobs/authorizations and release only unstarted holds. Claimed work denies. */
 invalidateUnclaimedWork(scope:FactoryScope,expectedContentVersion:number,reason:string,at:string):Promise<void>;
 verifyCurrentApprover(approval:NonNullable<FactoryEnvelope['humanApproval']>,scope:FactoryScope,at:string):Promise<void>;
 recheck(principal:FactoryPrincipal,scope:FactoryScope,at:string):Promise<void>;
 save(scope:FactoryScope,expectedVersion:number,next:FactoryEnvelope):Promise<void>;
}
export interface FactoryStore {capability:'content-factory';transaction<T>(scope:FactoryScope,work:(tx:FactoryTransaction)=>Promise<T>):Promise<T>}
export class UnavailableFactoryStore implements FactoryStore {
 readonly capability='content-factory' as const;
 async transaction<T>():Promise<T>{throw Error('DURABLE_CONTENT_FACTORY_ADAPTER_REQUIRED');}
}
const body=z.discriminatedUnion('kind',[
 z.object({kind:z.literal('research'),sources:z.array(researchSourceSchema).min(1).max(30)}).strict(),
 z.object({kind:z.literal('brief'),brief:contentBriefSchema}).strict(),
 z.object({kind:z.literal('draft'),text:z.string().trim().min(20).max(50000)}).strict(),
 z.object({kind:z.literal('revise'),text:z.string().trim().min(20).max(50000),reason:text(1000)}).strict(),
 z.object({kind:z.literal('quality'),report:qualityReportSchema}).strict(),
 z.object({kind:z.literal('approve'),reviewedHash:hash,qualityId:id,explicitHumanConsent:z.literal(true)}).strict(),
 z.object({kind:z.literal('schedule'),channel:id.max(80),publishAt:time,reviewedHash:hash}).strict(),
 z.object({kind:z.literal('cancel'),reason:text(1000)}).strict()
]);
export const factoryCommandSchema=z.object({websiteId:id,contentId:id,expectedVersion:z.number().int().nonnegative().safe(),eventId:id,body}).strict();
export type FactoryCommand=z.infer<typeof factoryCommandSchema>;
function canonical(value:unknown):string {if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';if(value!==null&&typeof value==='object')return '{'+Object.entries(value).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([k,v])=>JSON.stringify(k)+':'+canonical(v)).join(',')+'}';return JSON.stringify(value);}
export const factoryHash=(value:unknown)=>createHash('sha256').update(canonical(value)).digest('hex');
export const factoryReviewHash=(e:FactoryEnvelope)=>factoryHash([e.record.organizationId,e.record.websiteId,e.record.id,e.record.contentType,e.brief,e.research,e.record.draft??null]);
const need=(condition:unknown,code:string)=>{if(!condition)throw Error(code);};
export function createFactoryEnvelope(input:Parameters<typeof createContentRecord>[0]):FactoryEnvelope{return {schemaVersion:1,record:createContentRecord(input),brief:null,research:[],quality:null,humanApproval:null,journal:[]};}
function assertPrincipal(p:FactoryPrincipal,scope:FactoryScope,now:string){
 const at=Date.parse(now),checked=Date.parse(p.checkedAt),until=Date.parse(p.expiresAt),session=Date.parse(p.sessionExpiresAt);
 need(p.organizationId===scope.organizationId&&p.websiteId===scope.websiteId&&id.safeParse(p.userId).success&&['owner','admin','editor'].includes(p.role)&&typeof p.regulated==='boolean'&&z.array(text(1000)).max(10).safeParse(p.requiredDisclosures).success&&id.safeParse(p.policyRevision).success,'FACTORY_MEMBERSHIP_DENIED');
 need([at,checked,until,session].every(Number.isFinite)&&checked<=at&&at<until&&at<session&&until-checked<=300000,'FACTORY_SESSION_EXPIRED');
}
function assertEnvelope(e:FactoryEnvelope,s:FactoryScope){need(e.schemaVersion===1&&e.record.organizationId===s.organizationId&&e.record.websiteId===s.websiteId&&e.record.id===s.contentId&&Number.isSafeInteger(e.record.version)&&e.record.version>=0&&Array.isArray(e.journal)&&Array.isArray(e.research),'FACTORY_STORAGE_SCOPE_DENIED');}
function fresh(e:{checkedAt?:string;observedAt?:string;expiresAt:string},at:string){const checked=Date.parse(e.checkedAt??e.observedAt??''),until=Date.parse(e.expiresAt),now=Date.parse(at);need(checked<=now&&now<until&&until>checked,'FACTORY_EVIDENCE_EXPIRED');}
async function verifySources(tx:FactoryTransaction,e:FactoryEnvelope,scope:FactoryScope,at:string,p:FactoryPrincipal){need(e.research.length>0,'VERIFIED_RESEARCH_REQUIRED');for(const source of e.research){researchSourceSchema.parse(source);fresh(source,at);await tx.verifyEvidence('source',structuredClone(source),{scope,reviewedHash:factoryReviewHash(e),at,regulated:p.regulated});}}
async function verifyQuality(tx:FactoryTransaction,e:FactoryEnvelope,scope:FactoryScope,at:string,p:FactoryPrincipal){
 need(e.quality&&e.quality.reviewedHash===factoryReviewHash(e),'QUALITY_VERSION_DENIED');const q=qualityReportSchema.parse(e.quality);fresh(q,at);await verifySources(tx,e,scope,at,p);
 need(q.factual.length===e.research.length&&new Set(q.factual.map(f=>f.sourceId)).size===e.research.length&&e.research.every(s=>q.factual.some(f=>f.sourceId===s.id&&f.claimHash===factoryHash(s.claim)&&f.result==='pass')),'FACT_CHECK_REQUIRED');
 need(q.originality.result==='pass'&&e.brief&&new Set(e.brief.assetIds).size===e.brief.assetIds.length&&new Set(q.rights.map(r=>r.assetId)).size===q.rights.length&&q.rights.length===e.brief.assetIds.length&&e.brief.assetIds.every(id=>q.rights.some(r=>r.assetId===id))&&q.rights.every(r=>r.permittedUses.includes('publication')&&(!r.attributionRequired||Boolean(r.attribution.trim()))),'ORIGINALITY_OR_RIGHTS_REVIEW_REQUIRED');
 need(q.disclosure.checked&&(!q.disclosure.required||Boolean(q.disclosure.text.trim()))&&[...p.requiredDisclosures,...(e.brief?.requiredDisclosures??[])].every(d=>q.disclosure.text.includes(d)),'DISCLOSURE_REQUIRED');
 if(p.regulated)need(q.regulatedReview&&q.regulatedReview.reviewedHash===q.reviewedHash&&Date.parse(q.regulatedReview.reviewedAt)<=Date.parse(at),'REGULATED_REVIEW_REQUIRED');
 await tx.verifyEvidence('quality',structuredClone(q),{scope,reviewedHash:factoryReviewHash(e),at,regulated:p.regulated});
}
/** Only authenticated server adapters may call this service. No HTTP route is enabled. */
export class ContentFactory {
 constructor(private readonly store:FactoryStore=new UnavailableFactoryStore(),private readonly clock:()=>number=Date.now){need(store.capability==='content-factory','FACTORY_CAPABILITY_DENIED');}
 async execute(context:FactoryContext,input:unknown):Promise<FactoryEnvelope>{
 const command=factoryCommandSchema.parse(input),ctx=z.object({sessionHash:hash,organizationId:id}).strict().parse(context);const scope={organizationId:ctx.organizationId,websiteId:command.websiteId,contentId:command.contentId};
 return this.store.transaction(scope,async tx=>{
 const at=new Date(this.clock()).toISOString(),p=structuredClone(await tx.authenticate(ctx,scope,at));assertPrincipal(p,scope,at);
 const loaded=await tx.load(scope);need(loaded,'FACTORY_CONTENT_NOT_FOUND');const current=structuredClone(loaded!);assertEnvelope(current,scope);
 const proof=factoryHash([ctx.organizationId,command]);need(!current.journal.some(e=>e.eventId===command.eventId)&&!current.record.eventIds.includes(command.eventId),'FACTORY_EVENT_REPLAY');need(current.record.version===command.expectedVersion&&current.record.version<Number.MAX_SAFE_INTEGER,'FACTORY_VERSION_CONFLICT');
 need(!['publication_unknown','published','attributed','cancelled'].includes(current.record.stage),'FACTORY_TERMINAL_OR_CLAIMED');
 let next=structuredClone(current);const b=command.body,event={eventId:command.eventId,at};
 switch(b.kind){
 case 'research':need(current.record.stage==='proposed','FACTORY_RESEARCH_STATE');need(new Set(b.sources.map(s=>s.id)).size===b.sources.length,'DUPLICATE_SOURCE');next.research=structuredClone(b.sources);await verifySources(tx,next,scope,at,p);next.record=transitionContent(current.record,{...event,kind:'research',sources:b.sources.map(s=>({url:s.url,claim:s.claim,observedAt:s.observedAt}))},p);break;
 case 'brief':need(current.record.stage==='researched'&&new Set(b.brief.assetIds).size===b.brief.assetIds.length,'FACTORY_BRIEF_STATE');await verifySources(tx,current,scope,at,p);next.brief=structuredClone(b.brief);next.record={...current.record,version:current.record.version+1,eventIds:[...current.record.eventIds,command.eventId]};break;
 case 'draft':need(current.brief,'CONTENT_BRIEF_REQUIRED');await verifySources(tx,current,scope,at,p);next.record=transitionContent(current.record,{...event,kind:'draft',text:b.text},p);break;
 case 'revise':await tx.invalidateUnclaimedWork(scope,current.record.version,b.reason,at);need(['drafted','review_required','quality_passed','approved','scheduled'].includes(current.record.stage),'FACTORY_REVISION_STATE');await verifySources(tx,current,scope,at,p);next.record={...current.record,draft:b.text,stage:'drafted',version:current.record.version+1,eventIds:[...current.record.eventIds,command.eventId]};delete next.record.quality;delete next.record.approval;delete next.record.schedule;delete (next.record as ContentRecord&{factoryReviewDigest?:string}).factoryReviewDigest;next.quality=null;next.humanApproval=null;break;
 case 'quality':next.quality=structuredClone(b.report);await verifyQuality(tx,next,scope,at,p);next.record=transitionContent(current.record,{...event,kind:'quality',regulated:p.regulated,evidence:{factual:true,original:true,rightsCleared:true,disclosureChecked:true,ymylReviewed:Boolean(b.report.regulatedReview),notes:'Verified report '+b.report.id}},p);break;
 case 'approve':need(['owner','admin'].includes(p.role),'FACTORY_HUMAN_APPROVER_REQUIRED');need(b.reviewedHash===factoryReviewHash(current)&&b.qualityId===current.quality?.id,'STALE_HUMAN_REVIEW');await verifyQuality(tx,current,scope,at,p);next.record={...transitionContent(current.record,{...event,kind:'approve'},p),factoryReviewDigest:b.reviewedHash};next.humanApproval={actorId:p.userId,reviewedHash:b.reviewedHash,qualityId:b.qualityId,at};break;
 case 'schedule':need(['owner','admin'].includes(p.role)&&current.humanApproval?.reviewedHash===factoryReviewHash(current)&&b.reviewedHash===factoryReviewHash(current),'SCHEDULE_APPROVAL_REQUIRED');await tx.verifyCurrentApprover(structuredClone(current.humanApproval!),scope,at);await verifyQuality(tx,current,scope,at,p);next.record=transitionContent(current.record,{...event,kind:'schedule',channel:b.channel,publishAt:b.publishAt},p);break;
 case 'cancel':await tx.invalidateUnclaimedWork(scope,current.record.version,b.reason,at);next.record=transitionContent(current.record,{...event,kind:'cancel'},p);break;
 }
 next.journal=[...current.journal,{eventId:command.eventId,commandHash:proof,actorId:p.userId,operation:b.kind,at,version:next.record.version}];
 const boundary=new Date(this.clock()).toISOString();assertPrincipal(p,scope,boundary);if(['research','brief','draft','revise'].includes(b.kind))await verifySources(tx,next,scope,boundary,p);if(['quality','approve','schedule'].includes(b.kind))await verifyQuality(tx,next,scope,boundary,p);if(b.kind==='schedule')await tx.verifyCurrentApprover(structuredClone(next.humanApproval!),scope,boundary);await tx.recheck(p,scope,boundary);await tx.save(scope,current.record.version,structuredClone(next));return structuredClone(next);
 });}
}
