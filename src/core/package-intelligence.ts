import type { Plan } from './competitive-intelligence';
import type { DiscoveredFeatureCandidate } from './feature-intelligence';

export interface PlanSnapshot {
 plan:Plan;
 priceMonthly?:number|null;
 currency?:string;
 featureKeys:string[];
 limits:Record<string,number|null>;
 evidence:string[];
 capturedAt:string;
}

export interface SitePackageSnapshot {
 siteId:string;
 productName:string;
 plans:PlanSnapshot[];
 capturedAt:string;
}

export interface PackageComparisonRow {
 featureKey:string;
 featureName:string;
 ours:Record<Plan,boolean>;
 competitors:Record<Plan,{present:boolean;competitorCount:number}>;
 recommendation:'consider_free'|'pro_upgrade'|'business_upgrade'|'parity_review';
 evidence:string[];
}

export function buildPackageSnapshot(
 siteId:string,
 productName:string,
 features:DiscoveredFeatureCandidate[],
 planAccess:Partial<Record<Plan,string[]>>,
 capturedAt:string,
):SitePackageSnapshot {
 const plans:PlanSnapshot[]=(['free','pro','business'] as Plan[]).map(plan=>({
  plan,
  featureKeys:planAccess[plan]??[],
  limits:{},
  evidence:[],
  capturedAt,
 }));
 return {siteId,productName,plans,capturedAt};
}

export function comparePackageSnapshots(
 ours:SitePackageSnapshot,
 competitors:SitePackageSnapshot[],
 featureNames:Record<string,string>,
):PackageComparisonRow[] {
 const result=new Map<string,PackageComparisonRow>();
 const ownByPlan=(plan:Plan)=>new Set(ours.plans.find(p=>p.plan===plan)?.featureKeys??[]);
 for(const competitor of competitors){
  for(const plan of ['free','pro','business'] as Plan[]){
   for(const key of competitor.plans.find(p=>p.plan===plan)?.featureKeys??[]){
    const row=result.get(key)??{
      featureKey:key,
      featureName:featureNames[key]??key,
      ours:{free:ownByPlan('free').has(key),pro:ownByPlan('pro').has(key),business:ownByPlan('business').has(key)},
      competitors:{free:{present:false,competitorCount:0},pro:{present:false,competitorCount:0},business:{present:false,competitorCount:0}},
      recommendation:'parity_review' as const,
      evidence:[],
    };
    if(!row.competitors[plan].present) row.competitors[plan].present=true;
    row.competitors[plan].competitorCount+=1;
    row.evidence.push(...(competitor.plans.find(p=>p.plan===plan)?.evidence??[]));
    result.set(key,row);
   }
  }
 }
 for(const row of result.values()){
  if(!row.ours.business&&row.competitors.business.present) row.recommendation='business_upgrade';
  else if(!row.ours.pro&&row.competitors.pro.present) row.recommendation='pro_upgrade';
  else if(!row.ours.free&&row.competitors.free.present) row.recommendation='consider_free';
 }
 return [...result.values()].sort((a,b)=>
   (b.competitors.business.competitorCount+b.competitors.pro.competitorCount+b.competitors.free.competitorCount)-
   (a.competitors.business.competitorCount+a.competitors.pro.competitorCount+a.competitors.free.competitorCount)
 );
}
