import type { RecommendationDetail } from './recommendation-detail';
import { assertDetailTransition } from './recommendation-detail';
import { normalizeApprovalCommand, targetStatusForApproval, type ApprovalCommandInput } from './approval-command';
export interface ApprovalCommandService { decide(input:ApprovalCommandInput):Promise<RecommendationDetail>; }
export async function executeApprovalCommand(service:ApprovalCommandService,input:ApprovalCommandInput):Promise<RecommendationDetail>{
 const normalized=normalizeApprovalCommand(input);
 const target=targetStatusForApproval(normalized.action);
 return service.decide(normalized).then(result=>{assertDetailTransition(result,target);return result;});
}
