export interface FunnelStep { key:string; name:string; visitors:number; conversions:number; }
export interface CroSignal { step:string; rate:number; sampleSize:number; title:string; successMetric:string; }
export function conversionRate(visitors:number,conversions:number):number{
 if(!Number.isFinite(visitors)||visitors<=0)return 0;
 return Math.max(0,Math.min(1,conversions/visitors));
}
export function findFunnelSignals(steps:FunnelStep[],minimumVisitors=30):CroSignal[]{
 return steps.filter(s=>s.visitors>=minimumVisitors).map(s=>({
  step:s.key,rate:conversionRate(s.visitors,s.conversions),sampleSize:s.visitors,
  title:`Review ${s.name} conversion`,successMetric:`${s.name} conversion rate`
 })).sort((a,b)=>a.rate-b.rate);
}
