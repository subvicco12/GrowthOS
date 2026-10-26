import {z} from 'zod';
import {compareCompetitorFeatures,validateCompetitorPackage,type CompetitorPackage} from './local-competitor-workspace';
const id=z.string().min(1).max(120).regex(/^[A-Za-z0-9:_-]+$/);
const text=z.string().trim().min(3).max(240).refine(v=>!/[<>\u0000-\u001f]/.test(v));
const day=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v=>Number.isFinite(Date.parse(v+'T00:00:00Z'))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v);
const count=z.number().int().nonnegative().safe();
const currency=z.string().regex(/^[A-Z]{3}$/);
const channel=z.enum(['subscription','advertising','affiliate','lead-generation','digital-products','business-services']);
const tier=z.enum(['free','pro','business']);
const price=z.object({minor:count,currency,interval:z.enum(['month','year']),region:z.string().trim().min(2).max(60).refine(v=>!/[<>\u0000-\u001f]/.test(v))}).strict();
const proposedTier=z.object({tier,features:z.array(text).max(20),usageLimit:count.nullable(),price:price.nullable()}).strict();
const profile=z.object({category:text,objective:text,channels:z.array(channel).max(6),subscriptionModel:z.enum(['unknown','free','free-pro-business','subscription','none']),tiers:z.array(proposedTier).max(3),evidence:z.literal('manual-unverified')}).strict();
const funnel=z.object({id,from:day,through:day,source:text,provenance:z.enum(['manual-unverified','synthetic']),visitorDefinition:z.enum(['sessions','unique-visitors']),
 landingVisits:count.nullable(),signupStarts:count.nullable(),signupCompletions:count.nullable(),activations:count.nullable(),
 upgradeVisits:count.nullable(),checkoutStarts:count.nullable(),checkoutCompletions:count.nullable(),
 openingPaidSubscribers:count.nullable(),renewals:count.nullable(),cancellations:count.nullable()}).strict();
const scenario=z.object({id,kind:z.enum(['paid-conversion','retention','annual-adoption','qualified-leads','affiliate','advertising']),
 periodFrom:day,periodThrough:day,currency,audienceCount:count,baselineOutcomes:count,proposedOutcomes:count,valuePerOutcomeMinor:count,
 assumption:text,state:z.literal('hypothetical-local-only')}).strict();
const experiment=z.object({id,hypothesis:text,segment:text,existingTier:tier,alternativeTier:tier,
 existingPrice:price.nullable(),alternativePrice:price.nullable(),customerBenefit:text,risks:text,measurement:text,successCriteria:text,
 rollback:text,state:z.literal('local-review-only')}).strict();
const schema=z.object({format:z.literal('growthos-revenue-preview'),version:z.literal(1),organizationId:id,websiteId:id,
 profile,funnels:z.array(funnel).max(20),scenarios:z.array(scenario).max(20),experiments:z.array(experiment).max(20),authority:z.literal('none')}).strict();
export type RevenuePreview=z.infer<typeof schema>;
export type FunnelSnapshot=z.infer<typeof funnel>;
export type RevenueScenario=z.infer<typeof scenario>;
export type PricingExperiment=z.infer<typeof experiment>;
export const revenueChannels=channel.options;
export const emptyRevenuePreview=(scope:{organizationId:string;websiteId:string}):RevenuePreview=>({format:'growthos-revenue-preview',version:1,...scope,
 profile:{category:'Unknown category',objective:'Review customer value',channels:[],subscriptionModel:'unknown',tiers:[],evidence:'manual-unverified'},
 funnels:[],scenarios:[],experiments:[],authority:'none'});
const unique=(items:string[])=>new Set(items).size===items.length;
const checkFunnel=(f:FunnelSnapshot)=>{
 if(f.from>f.through)throw Error('REVENUE_PERIOD_DENIED');
 const ordered=(a:number|null,b:number|null)=>a!==null&&b!==null&&b>a;
 if(ordered(f.landingVisits,f.signupStarts)||ordered(f.signupStarts,f.signupCompletions)||ordered(f.signupCompletions,f.activations)||
    ordered(f.upgradeVisits,f.checkoutStarts)||ordered(f.checkoutStarts,f.checkoutCompletions)||
    ordered(f.openingPaidSubscribers,f.renewals)||ordered(f.openingPaidSubscribers,f.cancellations)||
    (f.openingPaidSubscribers!==null&&f.renewals!==null&&f.cancellations!==null&&f.renewals+f.cancellations>f.openingPaidSubscribers))throw Error('REVENUE_FUNNEL_DENIED');
};
export function validateRevenuePreview(raw:unknown,scope:{organizationId:string;websiteId:string}):RevenuePreview{
 const p=schema.parse(raw);if(p.organizationId!==scope.organizationId||p.websiteId!==scope.websiteId)throw Error('REVENUE_SCOPE_DENIED');
 if(!unique(p.profile.channels)||!unique(p.profile.tiers.map(t=>t.tier))||!unique(p.funnels.map(f=>f.id))||
  !unique(p.scenarios.map(s=>s.id))||!unique(p.experiments.map(e=>e.id)))throw Error('REVENUE_DUPLICATE_DENIED');
 for(const t of p.profile.tiers)if(!unique(t.features))throw Error('REVENUE_TIER_DENIED');
 for(const f of p.funnels)checkFunnel(f);
 for(const s of p.scenarios)if(s.periodFrom>s.periodThrough||s.baselineOutcomes>s.audienceCount||s.proposedOutcomes>s.audienceCount||
  s.proposedOutcomes<s.baselineOutcomes)throw Error('REVENUE_SCENARIO_DENIED');
 return p;
}
export const funnelRate=(numerator:number|null,denominator:number|null):number|null=>
 numerator===null||denominator===null||denominator===0?null:numerator/denominator;
export function analyzeFunnel(raw:unknown){const f=funnel.parse(raw);checkFunnel(f);return {scope:'single-source-single-period' as const,
 signup:funnelRate(f.signupCompletions,f.signupStarts),activation:funnelRate(f.activations,f.signupCompletions),
 checkout:funnelRate(f.checkoutCompletions,f.checkoutStarts),renewal:funnelRate(f.renewals,f.openingPaidSubscribers),
 cancellation:funnelRate(f.cancellations,f.openingPaidSubscribers),provenance:f.provenance,period:[f.from,f.through]};}
export function calculateRevenueScenario(raw:unknown){const s=scenario.parse(raw);
 if(s.periodFrom>s.periodThrough||s.baselineOutcomes>s.audienceCount||s.proposedOutcomes>s.audienceCount||s.proposedOutcomes<s.baselineOutcomes)throw Error('REVENUE_SCENARIO_DENIED');
 const difference=s.proposedOutcomes-s.baselineOutcomes,additional=BigInt(difference)*BigInt(s.valuePerOutcomeMinor);
 if(additional>BigInt(Number.MAX_SAFE_INTEGER))throw Error('REVENUE_SCENARIO_OVERFLOW');
 return {id:s.id,kind:s.kind,additionalOutcomes:difference,hypotheticalAdditionalMinor:Number(additional),currency:s.currency,
 formula:'(proposed outcomes - baseline outcomes) × assumed value per outcome',state:'hypothetical-not-forecast' as const,
 warning:'Hypothetical scenario — not revenue forecasts or verified earnings. No cost, churn or settlement included.'};
}
export function compareCompetitorPricing(raw:unknown,scope:{organizationId:string;websiteId:string},today:string,ours:RevenuePreview){
 const p=validateCompetitorPackage(raw,scope,today);validateRevenuePreview(ours,scope);
 return p.claims.filter(c=>!c.revoked&&c.availability!=='unknown').map(c=>{
  const own=ours.profile.tiers.filter(t=>c.tiers.includes(t.tier));const comparable=own.filter(t=>t.price&&c.pricing&&
    t.price.currency===c.pricing.currency&&t.price.interval===c.pricing.period);
  return {claimId:c.id,competitorId:c.competitorId,featureId:c.featureId,source:c.source,observedOn:c.observedOn,
   reported:c.pricing,ownProposals:own.map(t=>({tier:t.tier,price:t.price})),priceComparison:comparable.length&&c.pricing?
     comparable.map(t=>({tier:t.tier,differenceMinor:t.price!.minor-c.pricing!.minor})):null,
   limitation:!c.pricing?'Pricing unknown':!comparable.length?'Currency or billing interval differs, or own price is unavailable':
     'Regional scope and package equivalence are unverified; numerical difference is not an equivalent-price claim',
   provenance:'unverified-manual' as const};
 });
}
export type RevenueOpportunity={id:string;organizationId:string;websiteId:string;kind:'tier-differentiation'|'conversion-friction'|'renewal-review'|'category-channel'|'competitor-package';
 title:string;reason:string;customerBenefit:string;evidenceRefs:string[];priority:number;confidence:'low';cost:'unknown';impact:'unknown';
 provenance:'unverified-manual'|'synthetic-or-mixed';risks:string[];authority:'review-only'};
export function revenueOpportunities(raw:unknown,scope:{organizationId:string;websiteId:string},today:string,competitorPackage:CompetitorPackage|null=null):RevenueOpportunity[]{
 const p=validateRevenuePreview(raw,scope),results:RevenueOpportunity[]=[];day.parse(today);
 const add=(kind:RevenueOpportunity['kind'],title:string,reason:string,refs:string[],priority:number,risks:string[],synthetic=false)=>{
  if(!refs.length)return;const existing=results.find(x=>x.kind===kind);if(existing){existing.evidenceRefs=[...new Set([...existing.evidenceRefs,...refs])].slice(0,30);
   existing.provenance=synthetic?'synthetic-or-mixed':existing.provenance;return;}results.push({id:`revenue:${scope.websiteId}:${kind}`,...scope,kind,title,reason,
   customerBenefit:'Customer value requires validation',evidenceRefs:refs,priority,confidence:'low',cost:'unknown',impact:'unknown',
   provenance:synthetic?'synthetic-or-mixed':'unverified-manual',risks,authority:'review-only'});
 };
 const profileRef=`profile:${scope.websiteId}`;
 if(p.profile.subscriptionModel==='free-pro-business'&&p.profile.tiers.length===3){
  const free=p.profile.tiers.find(t=>t.tier==='free'),pro=p.profile.tiers.find(t=>t.tier==='pro'),business=p.profile.tiers.find(t=>t.tier==='business');
  if(free&&pro&&business&&(!pro.features.some(x=>!free.features.includes(x))||!business.features.some(x=>!pro.features.includes(x))))
   add('tier-differentiation','Review paid-tier customer value','Pro or Business lacks an explicit distinct proposed benefit',[profileRef],2,['Do not alter live entitlements or pricing']);
 }
 for(const f of p.funnels.filter(f=>f.through<=today)){
  const rates=analyzeFunnel(f);
  if(rates.checkout!==null&&rates.checkout<0.3&&f.checkoutStarts!==null&&f.checkoutStarts>=20)
   add('conversion-friction','Inspect checkout journey','Manually reported checkout completion is below 30%',[f.id],3,['Verify cohort, attribution and checkout definitions'],f.provenance==='synthetic');
  if(rates.cancellation!==null&&rates.cancellation>0.1&&f.openingPaidSubscribers!==null&&f.openingPaidSubscribers>=20)
   add('renewal-review','Review retention journey','Manually reported cancellation exceeds 10% of opening paid subscribers',[f.id],3,['Verify renewal and cancellation definitions'],f.provenance==='synthetic');
 }
 if(/comparison|directory|review|tools/i.test(p.profile.category)&&!p.profile.channels.includes('affiliate'))
  add('category-channel','Evaluate relevant affiliate disclosures','Category may support a carefully disclosed comparison model',[profileRef],1,['Suitability, rights and customer trust are unverified']);
 if(competitorPackage){const gaps=compareCompetitorFeatures(competitorPackage,scope,today).filter(g=>g.category==='monetization'||g.category==='reporting');
  if(gaps.length)add('competitor-package','Review competitor package claims','Reported competitor features may inform paid-tier planning',gaps.flatMap(g=>g.claimIds).slice(0,30),2,
    ['Competitor claims are unverified; do not copy pricing or features without customer-value review']);
 }
 return results.sort((a,b)=>b.priority-a.priority||a.id.localeCompare(b.id));
}
const handoffSchema=z.object({id,organizationId:id,websiteId:id,kind:z.enum(['tier-differentiation','conversion-friction','renewal-review','category-channel','competitor-package','reconciliation-gap']),
 title:text,reason:text,customerBenefit:text,evidenceRefs:z.array(id).min(1).max(30),priority:z.number().int().min(1).max(5),
 provenance:z.enum(['unverified-manual','synthetic-or-mixed']),authority:z.literal('review-only'),cost:z.literal('unknown'),impact:z.literal('unknown')}).strict();
export type RevenueHandoff=z.infer<typeof handoffSchema>;
export function validateRevenueHandoff(raw:unknown,scope:{organizationId:string;websiteId:string}){const h=handoffSchema.parse(raw);
 if(h.organizationId!==scope.organizationId||h.websiteId!==scope.websiteId||h.id!==`revenue:${scope.websiteId}:${h.kind}`||!unique(h.evidenceRefs))throw Error('REVENUE_HANDOFF_SCOPE_DENIED');return h;}
export function prepareRevenueHandoff(raw:unknown,scope:{organizationId:string;websiteId:string},today:string,selectedId:string,competitors:CompetitorPackage|null=null){
 const o=revenueOpportunities(raw,scope,today,competitors).find(x=>x.id===selectedId);if(!o)throw Error('REVENUE_OPPORTUNITY_DENIED');
 const {risks:_,confidence:__, ...handoff}=o;return validateRevenueHandoff(handoff,scope);
}
export function exportRevenuePreview(raw:unknown,scope:{organizationId:string;websiteId:string}){const wire=JSON.stringify(validateRevenuePreview(raw,scope));
 if(new TextEncoder().encode(wire).byteLength>250_000)throw Error('REVENUE_EXPORT_SIZE_DENIED');return wire;}
export function importRevenuePreview(bytes:Uint8Array,scope:{organizationId:string;websiteId:string}){
 if(!bytes.byteLength||bytes.byteLength>250_000)throw Error('REVENUE_IMPORT_SIZE_DENIED');
 return validateRevenuePreview(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)) as unknown,scope);
}
