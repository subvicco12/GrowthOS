export type GrowthCategory='seo'|'search_ai'|'content'|'cro'|'retention'|'referral'|'reputation'|'revenue'|'business';

export interface GrowthEvidence { source:string; observedAt:string; excerpt?:string; url?:string; }
export interface GrowthSignal {
 id:string; siteId:string; category:GrowthCategory; title:string; description:string;
 evidence:GrowthEvidence[]; impact:number; confidence:number; effort:number; recurringCostUsd:number; risk:number;
 successMetric:string; approvalClass:'green'|'amber'|'red';
}

const clamp=(v:number)=>Math.max(1,Math.min(5,Math.round(v)));
export function growthApprovalClass(category:GrowthCategory,risk:number):GrowthSignal['approvalClass']{
 if(category==='revenue'||risk>=5)return 'red';
 if(category==='seo'||category==='content'||category==='cro'||category==='retention'||category==='referral'||category==='reputation')return 'amber';
 return 'green';
}
export function rankGrowthSignal(input:Omit<GrowthSignal,'approvalClass'>):GrowthSignal{
 const impact=clamp(input.impact),confidence=clamp(input.confidence),effort=clamp(input.effort),risk=clamp(input.risk),cost=Math.max(0,input.recurringCostUsd);
 return {...input,impact,confidence,effort,risk,recurringCostUsd:cost,approvalClass:growthApprovalClass(input.category,risk)};
}
export function scoreGrowthSignal(signal:GrowthSignal):number{
 return Math.round(((signal.impact*signal.confidence)/(signal.effort+signal.risk+(signal.recurringCostUsd>0?1:0)))*100)/100;
}
export function rankGrowthSignals(signals:GrowthSignal[]):GrowthSignal[]{
 return [...signals].sort((a,b)=>scoreGrowthSignal(b)-scoreGrowthSignal(a)||b.confidence-a.confidence||a.title.localeCompare(b.title));
}
export interface NextBestAction { signalId:string; title:string; category:GrowthCategory; score:number; approvalClass:GrowthSignal['approvalClass']; successMetric:string; evidenceCount:number; }
export function buildNextBestActions(signals:GrowthSignal[],limit=7):NextBestAction[]{
 return rankGrowthSignals(signals).slice(0,Math.max(1,limit)).map(s=>({signalId:s.id,title:s.title,category:s.category,score:scoreGrowthSignal(s),approvalClass:s.approvalClass,successMetric:s.successMetric,evidenceCount:s.evidence.length}));
}
