import type { ApprovalAction, ApprovalCommandInput } from './approval-command';
import type { ApprovalCommandService } from './approval-command-service';
import type { RecommendationDetail } from './recommendation-detail';
import { buildRecommendationDetail } from './recommendation-detail';
import type { PostgresRecommendationApprovalService } from './recommendation-approval-service';
import type { ApprovalDecision } from './approval-store-postgres';
const decisionForAction:Record<ApprovalAction,ApprovalDecision>={approve:'approved',reject:'rejected',defer:'deferred'};
export class PostgresApprovalCommandAdapter implements ApprovalCommandService {
 constructor(private readonly approvals:PostgresRecommendationApprovalService){}
 async decide(input:ApprovalCommandInput):Promise<RecommendationDetail>{
  const record=await this.approvals.decide({recommendationId:input.recommendationId,actorId:input.actorId,decision:decisionForAction[input.action],note:input.note,idempotencyKey:input.idempotencyKey});
  return buildRecommendationDetail(record);
 }
}
