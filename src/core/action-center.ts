import type { RecommendationRecord } from './recommendations';
import type { OperationalCounts } from './operational-dashboard';
export interface ActionItem { id:string; siteId:string; title:string; category:string; score:number; approvalClass:'green'|'amber'|'red'; status:RecommendationRecord['status']; reason:string; }
export function buildNextBestActions(items:ActionItem[],limit=5):ActionItem[]{
 return [...items].filter(x=>x.status!=='rejected'&&x.status!=='verified').sort((a,b)=>b.score-a.score||a.approvalClass.localeCompare(b.approvalClass)||a.title.localeCompare(b.title)).slice(0,Math.max(0,limit));
}
export interface ApprovalInboxItem extends ActionItem { evidence:string[]; impact:number; confidence:number; effort:number; risk:number; }
export function buildApprovalInbox(items:ApprovalInboxItem[]):ApprovalInboxItem[]{
 return items.filter(x=>x.status==='proposed'&&x.approvalClass!=='green').sort((a,b)=>b.score-a.score||a.title.localeCompare(b.title));
}
export function countsFromOperationalItems(items:Array<{status:RecommendationRecord['status'];approvalClass:'green'|'amber'|'red'}>):Partial<OperationalCounts>{
 return {needsApproval:items.filter(x=>x.status==='proposed'&&x.approvalClass!=='green').length,activeJobs:0};
}
