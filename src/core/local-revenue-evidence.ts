import {z} from 'zod';
const id=z.string().min(1).max(120).regex(/^[A-Za-z0-9:_-]+$/);
const label=z.string().trim().min(3).max(240).refine(s=>!/[<>\u0000-\u001f]/.test(s));
const day=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v=>Number.isFinite(Date.parse(v+'T00:00:00Z'))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v);
const observation=z.object({id,organizationId:id,websiteId:id,source:z.enum(['subscription','advertising','affiliate','lead-generation','digital-products','business-services','other']),
 sourceLabel:label,externalReference:label,from:day,through:day,observedOn:day,currency:z.string().regex(/^[A-Z]{3}$/),amountMinor:z.number().int().safe().nonnegative(),
 basis:z.enum(['gross-reported','net-reported','attributed','estimated']),provenance:z.enum(['manual-unverified','imported-unverified','synthetic']),
 reconciliation:z.literal('not-reconciled'),authority:z.literal('none')}).strict();
const bundle=z.object({format:z.literal('growthos-revenue-evidence-preview'),version:z.literal(1),organizationId:id,websiteId:id,
 observations:z.array(observation).max(100),authority:z.literal('none')}).strict();
export type RevenueEvidence=z.infer<typeof observation>;export type RevenueEvidenceBundle=z.infer<typeof bundle>;
export const emptyRevenueEvidence=(scope:{organizationId:string;websiteId:string}):RevenueEvidenceBundle=>({format:'growthos-revenue-evidence-preview',version:1,...scope,observations:[],authority:'none'});
export function validateRevenueEvidence(raw:unknown,scope:{organizationId:string;websiteId:string},today:string){
 day.parse(today);const b=bundle.parse(raw);
 if(b.organizationId!==scope.organizationId||b.websiteId!==scope.websiteId)throw Error('REVENUE_EVIDENCE_SCOPE_DENIED');
 const ids=new Set<string>(),refs=new Set<string>();
 for(const o of b.observations){
  if(o.organizationId!==scope.organizationId||o.websiteId!==scope.websiteId)throw Error('REVENUE_EVIDENCE_SCOPE_DENIED');
  if(o.from>o.through||o.observedOn<o.through||o.observedOn>today)throw Error('REVENUE_EVIDENCE_PERIOD_DENIED');
  // A source reference cannot be reused with a changed amount, period or currency.
  const key=JSON.stringify([o.source,o.sourceLabel.toLowerCase(),o.externalReference.toLowerCase()]);
  if(ids.has(o.id)||refs.has(key))throw Error('REVENUE_EVIDENCE_DUPLICATE_DENIED');ids.add(o.id);refs.add(key);
 }
 return b;
}
export function addRevenueEvidence(raw:unknown,candidate:unknown,scope:{organizationId:string;websiteId:string},today:string){
 const b=validateRevenueEvidence(raw,scope,today),o=observation.parse(candidate);
 return validateRevenueEvidence({...b,observations:[...b.observations,o]},scope,today);
}
export function revenueEvidenceSummary(raw:unknown,scope:{organizationId:string;websiteId:string},today:string){
 const b=validateRevenueEvidence(raw,scope,today),sources=new Set(b.observations.map(o=>o.source));
 const groups=new Map<string,{currency:string;source:string;basis:string;from:string;through:string;amountMinor:number;observationIds:string[]}>();
 for(const o of b.observations){const key=JSON.stringify([o.currency,o.source,o.basis,o.from,o.through]);let g=groups.get(key);
  if(!g){g={currency:o.currency,source:o.source,basis:o.basis,from:o.from,through:o.through,amountMinor:0,observationIds:[]};groups.set(key,g);}
  const sum=BigInt(g.amountMinor)+BigInt(o.amountMinor);if(sum>BigInt(Number.MAX_SAFE_INTEGER))throw Error('REVENUE_EVIDENCE_SUM_OVERFLOW');
  g.amountMinor=Number(sum);g.observationIds.push(o.id);
 }
 return {websiteId:scope.websiteId,observationCount:b.observations.length,representedSources:[...sources].sort(),
  missingSources:(['subscription','advertising','affiliate','lead-generation','digital-products','business-services'] as const).filter(s=>!sources.has(s)),
  groups:[...groups.values()],verifiedRevenueMinor:null,reconciledRevenueMinor:null,
  blockers:['Provider account and resource ownership','Signed issuer and revocation state','Settlement or payout identifiers','Refunds, chargebacks and tax treatment','Currency, period and attribution reconciliation']};
}
export function portfolioRevenueCoverage(items:RevenueEvidenceBundle[],organizationId:string,websiteIds:string[],today:string){
 if(new Set(websiteIds).size!==websiteIds.length)throw Error('REVENUE_PORTFOLIO_DUPLICATE_SITE');
 const permitted=new Set(websiteIds),seen=new Set<string>();
 for(const item of items){if(item.organizationId!==organizationId||!permitted.has(item.websiteId)||seen.has(item.websiteId))throw Error('REVENUE_PORTFOLIO_SCOPE_DENIED');
  validateRevenueEvidence(item,{organizationId,websiteId:item.websiteId},today);seen.add(item.websiteId);}
 return websiteIds.map(websiteId=>{const b=items.find(x=>x.websiteId===websiteId);return {websiteId,observationCount:b?.observations.length??0,
  sourceCoverage:b?[...new Set(b.observations.map(o=>o.source))].sort():[],actualRevenue:'Unavailable' as const,reconciliation:'Unavailable' as const};});
}
export function exportRevenueEvidence(raw:unknown,scope:{organizationId:string;websiteId:string},today:string){const s=JSON.stringify(validateRevenueEvidence(raw,scope,today));
 if(new TextEncoder().encode(s).byteLength>250_000)throw Error('REVENUE_EVIDENCE_SIZE_DENIED');return s;}
export function importRevenueEvidence(bytes:Uint8Array,scope:{organizationId:string;websiteId:string},today:string){
 if(!bytes.byteLength||bytes.byteLength>250_000)throw Error('REVENUE_EVIDENCE_SIZE_DENIED');
 return validateRevenueEvidence(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)) as unknown,scope,today);
}
