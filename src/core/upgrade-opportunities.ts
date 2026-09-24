import type { PackageGap, Plan } from './competitive-intelligence';
import type { RankedOpportunity } from './opportunities';
const targetFor=(gap:PackageGap):Plan=>gap.opportunity==='consider_free'?'free':gap.opportunity==='pro_upgrade'?'pro':'business';
export interface UpgradeOpportunity extends RankedOpportunity { targetPlan:Plan; featureKey:string; competitorCount:number; }
export function packageUpgradeOpportunities(siteId:string,gaps:PackageGap[]):UpgradeOpportunity[]{
 return gaps.filter(g=>g.opportunity!=='parity_review').map(g=>{const targetPlan=targetFor(g);const impact=targetPlan==='business'?5:targetPlan==='pro'?4:2;const confidence=Math.min(5,2+g.competitors);const effort=3,risk=targetPlan==='free'?3:2;const score=Math.round(((impact*confidence)/(effort+risk))*100)/100;return {siteId,category:'packaging' as const,title:`Evaluate ${g.featureName} for ${targetPlan}`,evidence:[`${g.competitors} comparable competitor(s) expose this capability`,`Observed competitor plans: ${g.competitorPlans.join(', ')}`],impact,confidence,effort,recurringCostUsd:0,risk,score,approvalClass:'amber' as const,targetPlan,featureKey:g.featureKey,competitorCount:g.competitors};}).sort((a,b)=>b.score-a.score||b.competitorCount-a.competitorCount||a.title.localeCompare(b.title));
}
