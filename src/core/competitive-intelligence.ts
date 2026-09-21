export type Plan='free'|'pro'|'business';
export interface PackageFeature { key:string; name:string; plans:Record<Plan,boolean>; quota?:Partial<Record<Plan,number|null>>; }
export interface PackageInventory { product:string; currency?:string; monthlyPrice?:Partial<Record<Plan,number>>; features:PackageFeature[]; evidenceUrl?:string; capturedAt:string; }
export interface CompetitorProfile { name:string; domain:string; inventory:PackageInventory; similarity:number; evidence:string[]; }
export interface PackageGap { featureKey:string; featureName:string; competitors:number; ours:Record<Plan,boolean>; competitorPlans:Plan[]; opportunity:'consider_free'|'pro_upgrade'|'business_upgrade'|'parity_review'; }
const plans:Plan[]=['free','pro','business'];
export function comparePackages(ours:PackageInventory,competitors:CompetitorProfile[]):PackageGap[] {
 const byKey=new Map(ours.features.map(f=>[f.key,f]));
 const candidates=new Map<string,{name:string,count:number,plans:Set<Plan>}>();
 for(const competitor of competitors.filter(c=>c.similarity>=0.5)){
  for(const feature of competitor.inventory.features){
   const row=candidates.get(feature.key)??{name:feature.name,count:0,plans:new Set<Plan>()}; row.count++;
   for(const plan of plans)if(feature.plans[plan])row.plans.add(plan); candidates.set(feature.key,row);
  }
 }
 return [...candidates.entries()].map(([key,row])=>{
  const own=byKey.get(key); const access=own?.plans??{free:false,pro:false,business:false};
  let opportunity:PackageGap['opportunity']='parity_review';
  if(!access.business&&row.plans.has('business'))opportunity='business_upgrade';
  else if(!access.pro&&row.plans.has('pro'))opportunity='pro_upgrade';
  else if(!access.free&&row.plans.has('free'))opportunity='consider_free';
  return {featureKey:key,featureName:row.name,competitors:row.count,ours:access,competitorPlans:plans.filter(p=>row.plans.has(p)),opportunity};
 }).sort((a,b)=>b.competitors-a.competitors||a.featureName.localeCompare(b.featureName));
}
export function validateCompetitor(profile:CompetitorProfile):string[] {
 const issues:string[]=[];
 if(profile.similarity<0||profile.similarity>1)issues.push('INVALID_SIMILARITY');
 if(!profile.evidence.length)issues.push('EVIDENCE_REQUIRED');
 if(!/^https?:\/\//.test(profile.inventory.evidenceUrl??''))issues.push('PACKAGE_EVIDENCE_URL_REQUIRED');
 return issues;
}
