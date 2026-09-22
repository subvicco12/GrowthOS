import type { DashboardSnapshot } from './dashboard-repository';
import type { ApprovalInboxViewModel } from './approval-inbox-view';
import { buildApprovalInboxViewModel } from './approval-inbox-view';
export interface CommandCenterViewModel {
 metrics:{websites:number;activeJobs:number;needsApproval:number;exceptions:number};
 nextBestActions:DashboardSnapshot['nextBestActions'];
 approvalInbox:ApprovalInboxViewModel[];
 integrations:DashboardSnapshot['integrations'];
 generatedAt:string;
}
export function buildCommandCenterViewModel(snapshot:DashboardSnapshot,websiteCount:number):CommandCenterViewModel{
 const approvalItems=snapshot.approvalInbox.filter(x=>x.approvalClass==='amber'||x.approvalClass==='red').map(x=>({id:x.id,title:x.title,siteId:x.siteId,category:x.category,score:x.score,approvalClass:x.approvalClass as 'amber'|'red',risk:x.risk,impact:x.impact,confidence:x.confidence,effort:x.effort,evidence:x.evidence}));
 return {metrics:{websites:websiteCount,activeJobs:snapshot.activeJobs,needsApproval:snapshot.counts.needsApproval,exceptions:snapshot.counts.exceptions},nextBestActions:snapshot.nextBestActions,approvalInbox:buildApprovalInboxViewModel(approvalItems),integrations:snapshot.integrations,generatedAt:snapshot.generatedAt};
}
