import type { ApprovalAction } from './approval-command';
export interface ApprovalInboxViewModel { id:string; title:string; siteId:string; category:string; score:number; approvalClass:'amber'|'red'; risk:number; impact:number; confidence:number; effort:number; evidence:string[]; actions:ApprovalAction[]; }
export function buildApprovalInboxViewModel(items:Array<{id:string;title:string;siteId:string;category:string;score:number;approvalClass:'amber'|'red';risk:number;impact:number;confidence:number;effort:number;evidence:string[]}>):ApprovalInboxViewModel[]{
 return items.map(item=>({...item,actions:['approve','reject','defer'] as ApprovalAction[]}));
}
