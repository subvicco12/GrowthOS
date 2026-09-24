import type { CompetitorProfile, PackageInventory, Plan } from './competitive-intelligence';
export interface PackageChange { kind:'price_changed'|'feature_added'|'feature_removed'|'access_changed'; key:string; plan?:Plan; before?:number|boolean; after?:number|boolean; }
const plans:Plan[]=['free','pro','business'];
export function comparePackageHistory(previous:PackageInventory,current:PackageInventory):PackageChange[]{
 const out:PackageChange[]=[]; for(const p of plans){const a=previous.monthlyPrice?.[p],b=current.monthlyPrice?.[p];if(a!==b&&!(a===undefined&&b===undefined))out.push({kind:'price_changed',key:'monthlyPrice',plan:p,before:a,after:b});}
 const A=new Map(previous.features.map(f=>[f.key,f])),B=new Map(current.features.map(f=>[f.key,f]));
 for(const [k,f] of B){const old=A.get(k);if(!old){out.push({kind:'feature_added',key:k});continue;}for(const p of plans)if(old.plans[p]!==f.plans[p])out.push({kind:'access_changed',key:k,plan:p,before:old.plans[p],after:f.plans[p]});}
 for(const k of A.keys())if(!B.has(k))out.push({kind:'feature_removed',key:k}); return out;
}
export interface CompetitorChange { domain:string; changes:PackageChange[]; }
export function compareCompetitorHistory(previous:CompetitorProfile[],current:CompetitorProfile[]):CompetitorChange[]{
 const A=new Map(previous.map(c=>[c.domain,c])); const out:CompetitorChange[]=[]; for(const c of current){const old=A.get(c.domain);const changes:PackageChange[]=old?comparePackageHistory(old.inventory,c.inventory):c.inventory.features.map(f=>({kind:'feature_added',key:f.key}));if(changes.length)out.push({domain:c.domain,changes});} return out;
}
