import type { RecommendationDetail } from './recommendation-detail';
import { normalizeApprovalCommand, targetStatusForApproval, type ApprovalCommandInput } from './approval-command';
export interface ApprovalCommandService { decide(input:ApprovalCommandInput):Promise<RecommendationDetail>; }
export async function executeApprovalCommand(service:ApprovalCommandService,input:ApprovalCommandInput):Promise<RecommendationDetail>{
 const normalized=normalizeApprovalCommand(input);
 const target=targetStatusForApproval(normalized.action);
 const result=await service.decide(normalized);
 if(result.status!==target)throw new Error('APPROVAL_RESULT_STATUS_MISMATCH');
 return result;
}
