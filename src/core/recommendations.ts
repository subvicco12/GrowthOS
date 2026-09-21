import type { ApprovalClass, RankedOpportunity } from './opportunities';
export type RecommendationStatus='proposed'|'approved'|'rejected'|'deferred'|'implemented'|'verified';
export interface RecommendationRecord extends RankedOpportunity { id:string; status:RecommendationStatus; createdAt:string; }
export interface RecommendationRepository { create(input:RankedOpportunity):Promise<RecommendationRecord>; updateStatus(id:string,status:RecommendationStatus,note?:string):Promise<RecommendationRecord>; }
export interface ExecutableRecommendation { recommendation:RecommendationRecord; jobType:string; payload:Record<string,unknown>; }
export function canExecute(approvalClass:ApprovalClass,status:RecommendationStatus):boolean {
 if(approvalClass==='green')return status==='proposed'||status==='approved';
 return status==='approved';
}
export function executionFor(record:RecommendationRecord):ExecutableRecommendation {
 if(!canExecute(record.approvalClass,record.status))throw new Error('RECOMMENDATION_APPROVAL_REQUIRED');
 if(record.status==='implemented'||record.status==='verified'||record.status==='rejected'||record.status==='deferred')throw new Error('RECOMMENDATION_NOT_EXECUTABLE');
 return {recommendation:record,jobType:`recommendation.${record.category}`,payload:{recommendationId:record.id,siteId:record.siteId,title:record.title,evidence:record.evidence,approvalClass:record.approvalClass}};
}
export function assertApprovalTransition(from:RecommendationStatus,to:RecommendationStatus):void {
 const allowed:Record<RecommendationStatus,RecommendationStatus[]>={proposed:['approved','rejected','deferred'],approved:['implemented','rejected','deferred'],rejected:[],deferred:['approved','rejected'],implemented:['verified'],verified:[]};
 if(!allowed[from].includes(to))throw new Error('INVALID_RECOMMENDATION_TRANSITION');
}
