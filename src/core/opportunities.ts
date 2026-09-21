import type { PackageGap } from './competitive-intelligence';
export type RecommendationCategory='product'|'packaging'|'qa'|'seo'|'growth'|'revenue'|'engineering';
export type ApprovalClass='green'|'amber'|'red';
export interface OpportunityInput { siteId:string; category:RecommendationCategory; title:string; evidence:string[]; impact:number; confidence:number; effort:number; recurringCostUsd:number; risk:number; approvalClass?:ApprovalClass; }
export interface RankedOpportunity extends OpportunityInput { score:number; approvalClass:ApprovalClass; }
const bounded=(v:number)=>Number.isFinite(v)?Math.min(5,Math.max(1,Math.round(v))):1;
export function approvalClassFor(input:OpportunityInput):ApprovalClass {
 if(input.approvalClass)return input.approvalClass;
 if(input.category==='revenue'||input.risk>=5)return 'red';
 if(input.category==='product'||input.category==='packaging'||input.category==='growth'||input.category==='seo'||input.category==='engineering')return 'amber';
 return 'green';
}
export function rankOpportunity(input:OpportunityInput):RankedOpportunity {
 const impact=bounded(input.impact),confidence=bounded(input.confidence),effort=bounded(input.effort),risk=bounded(input.risk),cost=Math.max(0,input.recurringCostUsd);
 const score=Math.round(((impact*confidence)/(effort+risk+(cost>0?1:0)))*100)/100;
 return {...input,impact,confidence,effort,risk,recurringCostUsd:cost,approvalClass:approvalClassFor({...input,impact,confidence,effort,risk,recurringCostUsd:cost}),score};
}
export function packageGapsToOpportunities(siteId:string,gaps:PackageGap[]):RankedOpportunity[] {
 return gaps.filter(g=>g.opportunity!=='parity_review').map(g=>rankOpportunity({siteId,category:'packaging',title:`Review ${g.featureName} for ${g.opportunity.replaceAll('_',' ')}`,evidence:[`${g.competitors} relevant competitor(s) provide this capability`,`Observed tiers: ${g.competitorPlans.join(', ')}`],impact:Math.min(5,2+g.competitors),confidence:Math.min(5,2+g.competitors),effort:3,recurringCostUsd:0,risk:2})).sort((a,b)=>b.score-a.score||a.title.localeCompare(b.title));
}
