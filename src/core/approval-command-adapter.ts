import type { ApprovalCommandInput } from './approval-command';
import type { ApprovalCommandService } from './approval-command-service';
import type { RecommendationDetail } from './recommendation-detail';
import { buildRecommendationDetail } from './recommendation-detail';
import type { PostgresRecommendationApprovalService } from './recommendation-approval-service';
import { targetStatusForApproval } from './approval-command';
export class PostgresApprovalCommandAdapter implements ApprovalCommandService {
 constructor(private readonly approvals:PostgresRecommendationApprovalService){}
 async decide(input:ApprovalCommandInput):Promise<RecommendationDetail>{
  const record=await this.approvals.decide({recommendationId:input.recommendationId,actorId:input.actorId,decision:targetStatusForApproval(input.action),note:input.note,idempotencyKey:input.idempotencyKey});
  return buildRecommendationDetail(record);
 }
}
