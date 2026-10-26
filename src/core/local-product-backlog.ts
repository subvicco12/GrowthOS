import {z} from 'zod';
import type {ProductOpportunity} from './local-competitor-workspace';
import type {AnalyticsHandoff} from './local-analytics-handoff';
import {validateRevenueHandoff,type RevenueHandoff} from './local-revenue-workspace';
const id=z.string().trim().min(1).max(120).regex(/^[a-zA-Z0-9:_-]+$/);
const safe=z.string().trim().max(2000).refine(v=>!/[<>\u0000-\u001f]/.test(v));
const brief=z.string().trim().min(3).max(240).refine(v=>!/[<>\u0000-\u001f]/.test(v));
const tier=z.enum(['free','pro','business']);
const proposal=z.object({id,organizationId:id,websiteId:id,origin:z.enum(['manual','competitor-preview','analytics-import','revenue-preview']),originRef:id.optional(),title:brief,problem:brief,solution:brief,
 benefit:brief,evidenceRefs:z.array(id).max(30),targetTiers:z.array(tier).max(3),usageLimit:z.number().int().nonnegative().safe().nullable(),
 effort:z.enum(['unknown','low','medium','high']),estimatedCostMinor:z.number().int().nonnegative().safe().nullable(),currency:z.string().regex(/^[A-Z]{3}$/).nullable(),
 dependencies:z.array(id).max(20),featureChange:z.enum(['none','enable','disable','modify']),featureKey:id.nullable(),
 requirements:z.array(brief).max(20),acceptance:z.array(brief).max(20),security:safe,privacy:safe,tests:safe,rollback:safe,
 rollout:safe,requiredRole:z.enum(['owner','admin']),state:z.literal('local-review-only')}).strict();
const bundle=z.object({format:z.literal('growthos-product-backlog'),version:z.literal(1),organizationId:id,websiteId:id,
 proposals:z.array(proposal).max(50),authority:z.literal('none')}).strict();
export type ProductProposal=z.infer<typeof proposal>;export type ProductBacklog=z.infer<typeof bundle>;
export const emptyBacklog=(scope:{organizationId:string;websiteId:string}):ProductBacklog=>({format:'growthos-product-backlog',version:1,...scope,proposals:[],authority:'none'});
export function validateBacklog(raw:unknown,scope:{organizationId:string;websiteId:string}):ProductBacklog{
 const p=bundle.parse(raw);if(p.organizationId!==scope.organizationId||p.websiteId!==scope.websiteId||p.proposals.some(x=>x.organizationId!==scope.organizationId||x.websiteId!==scope.websiteId))throw Error('BACKLOG_SCOPE_DENIED');
 const ids=new Set(p.proposals.map(x=>x.id));if(ids.size!==p.proposals.length)throw Error('BACKLOG_DUPLICATE_ID');
 const originRefs=p.proposals.filter(x=>x.originRef).map(x=>x.origin+':'+x.originRef);if(new Set(originRefs).size!==originRefs.length)throw Error('BACKLOG_DUPLICATE_ORIGIN');
 for(const x of p.proposals){if(new Set(x.targetTiers).size!==x.targetTiers.length||new Set(x.dependencies).size!==x.dependencies.length||
   x.dependencies.includes(x.id)||x.dependencies.some(y=>!ids.has(y))||Boolean(x.estimatedCostMinor!==null)!==Boolean(x.currency!==null)||
   (x.featureChange!=='none'&&!x.featureKey)||(x.featureChange==='none'&&x.featureKey))throw Error('BACKLOG_REFERENCE_DENIED');}
 const visiting=new Set<string>(),done=new Set<string>(),byId=new Map(p.proposals.map(x=>[x.id,x]));
 const visit=(key:string)=>{if(visiting.has(key))throw Error('BACKLOG_DEPENDENCY_CYCLE');if(done.has(key))return;visiting.add(key);
   for(const dep of byId.get(key)!.dependencies)visit(dep);visiting.delete(key);done.add(key);};
 for(const key of ids)visit(key);return p;
}
export function fromCompetitorOpportunity(o:ProductOpportunity,scope:{organizationId:string;websiteId:string}):ProductProposal{
 if(o.websiteId!==scope.websiteId||!o.id.startsWith(scope.websiteId+':')||!o.claimIds.length||o.approval!=='not-requested'||o.cost!=='unknown'||o.impact!=='unknown')throw Error('BACKLOG_COMPETITOR_SCOPE_DENIED');
 return {id:'proposal-'+crypto.randomUUID(),...scope,origin:'competitor-preview',originRef:o.id,title:o.title,problem:'Review reported competitor gap and customer need',
  solution:'Evaluate a scoped product improvement',benefit:'Customer benefit to validate',evidenceRefs:[...o.claimIds],targetTiers:[],usageLimit:null,
  effort:'unknown',estimatedCostMinor:null,currency:null,dependencies:[],featureChange:'none',featureKey:null,
  requirements:[],acceptance:[],security:'',privacy:'',tests:'',rollback:'',rollout:'',requiredRole:'owner',state:'local-review-only'};
}
export function fromAnalyticsHandoff(h:AnalyticsHandoff,scope:{organizationId:string;websiteId:string}):ProductProposal{
 if(h.organizationId!==scope.organizationId||h.websiteId!==scope.websiteId||!h.originRef.startsWith(scope.websiteId+':')||
  !h.evidenceIds.length||h.evidenceIds.length>30||h.authority!=='review-only'||h.cost!=='unknown'||h.impact!=='unknown'||
  !['synthetic-or-mixed','unverified-import'].includes(h.provenance))throw Error('BACKLOG_ANALYTICS_SCOPE_DENIED');
 return proposal.parse({id:'proposal-'+crypto.randomUUID(),...scope,origin:'analytics-import',originRef:h.originRef,
  title:'Review '+h.category+' measurement opportunity',problem:h.problem,solution:h.action,benefit:'Customer value requires validation',
  evidenceRefs:h.evidenceIds,targetTiers:[],usageLimit:null,effort:'unknown',estimatedCostMinor:null,currency:null,dependencies:[],
  featureChange:'none',featureKey:null,requirements:[],acceptance:[],security:'',privacy:'',tests:'',rollback:'',rollout:'',requiredRole:'owner',state:'local-review-only'});
}
export function fromRevenueHandoff(raw:RevenueHandoff,scope:{organizationId:string;websiteId:string}):ProductProposal{
 const h=validateRevenueHandoff(raw,scope);
 return proposal.parse({id:'proposal-'+crypto.randomUUID(),...scope,origin:'revenue-preview',originRef:h.id,title:h.title,
  problem:h.reason,solution:'Review a scoped monetization or conversion improvement',benefit:h.customerBenefit,
  evidenceRefs:h.evidenceRefs,targetTiers:[],usageLimit:null,effort:'unknown',estimatedCostMinor:null,currency:null,
  dependencies:[],featureChange:'none',featureKey:null,requirements:[],acceptance:[],security:'',privacy:'',tests:'',rollback:'',rollout:'',
  requiredRole:'owner',state:'local-review-only'});
}
export function assessProductReadiness(x:ProductProposal,scope:{organizationId:string;websiteId:string},featureState:'unknown'|'enabled'|'disabled'|'unavailable'){
 const parsed=proposal.parse(x);if(parsed.organizationId!==scope.organizationId||parsed.websiteId!==scope.websiteId)throw Error('BACKLOG_SCOPE_DENIED');
 const blockers:string[]=[];
 if(parsed.problem.length<10||parsed.solution.length<10||parsed.benefit.length<10)blockers.push('Define problem, solution and customer benefit');
 if(!parsed.evidenceRefs.length)blockers.push('Attach and verify supporting evidence');

 if(!parsed.requirements.length||!parsed.acceptance.length)blockers.push('Define requirements and acceptance criteria');
 if(parsed.effort==='unknown'||parsed.estimatedCostMinor===null)blockers.push('Estimate effort and cost with budget authority');
 if(!parsed.security||!parsed.privacy||!parsed.tests||!parsed.rollback||!parsed.rollout)blockers.push('Complete security, privacy, tests, rollback and rollout review');
 if(parsed.featureChange!=='none'&&featureState==='unavailable')blockers.push('Authoritative feature control state unavailable');
 if(parsed.featureChange!=='none'&&featureState==='unknown')blockers.push('Verify current feature state');
 return {readyForReview:blockers.length===0,authorized:false,blockers,approvalGates:['Verify evidence authority and freshness independently','Recheck current permissions and explicit human approval']};
}
export function exportBacklog(raw:unknown,scope:{organizationId:string;websiteId:string}){const output=JSON.stringify(validateBacklog(raw,scope));
 if(new TextEncoder().encode(output).length>250_000)throw Error('BACKLOG_EXPORT_SIZE_DENIED');return output;}
export function importBacklog(bytes:Uint8Array,scope:{organizationId:string;websiteId:string}){
 if(!bytes.length||bytes.length>250_000)throw Error('BACKLOG_IMPORT_SIZE_DENIED');
 return validateBacklog(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)) as unknown,scope);
}
export const HANDOFF_WARNING='REVIEW ONLY — NOT AUTHORIZED FOR IMPLEMENTATION OR DEPLOYMENT.';
export function developmentHandoff(x:ProductProposal,scope:{organizationId:string;websiteId:string},featureState:'unknown'|'enabled'|'disabled'|'unavailable'){
 const assessment=assessProductReadiness(x,scope,featureState);const clean=(s:string)=>s.replaceAll(/([\\`*_{}[\]()#+.!|>~-])/g,'\\$1');
 return `${HANDOFF_WARNING}\n\n# ${clean(x.title)}\n\nWebsite: ${clean(scope.websiteId)} · Organization: ${clean(scope.organizationId)}\nStatus: unsaved local review only; authorization: none\n\nProblem: ${clean(x.problem)}\nSolution: ${clean(x.solution)}\nCustomer benefit: ${clean(x.benefit)}\nCompetitor evidence references: ${x.evidenceRefs.map(clean).join(', ')||'missing'} (unverified)\nProposed tiers: ${x.targetTiers.join(', ')||'unknown'}; usage limit: ${x.usageLimit??'unknown'}\nFeature proposal: ${x.featureChange} ${clean(x.featureKey??'')}; current state: ${featureState}\nRequirements: ${x.requirements.map(clean).join('; ')||'missing'}\nAcceptance: ${x.acceptance.map(clean).join('; ')||'missing'}\nDependencies: ${x.dependencies.map(clean).join(', ')||'none listed'}\nSecurity: ${clean(x.security)||'missing'}\nPrivacy: ${clean(x.privacy)||'missing'}\nTesting: ${clean(x.tests)||'missing'}\nRollout: ${clean(x.rollout)||'missing'}\nRollback: ${clean(x.rollback)||'missing'}\nCost: ${x.estimatedCostMinor===null?'unknown':x.currency+' '+x.estimatedCostMinor+' minor units'}; effort: ${x.effort}\nReview blockers: ${assessment.blockers.map(clean).join('; ')||'none for local review'}; approval gates: ${assessment.approvalGates.map(clean).join('; ')}\nApproval: explicitly required from ${x.requiredRole}; not requested.\n\n${HANDOFF_WARNING}\n`;
}
