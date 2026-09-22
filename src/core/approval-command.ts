import type { RecommendationStatus } from './recommendations';
export type ApprovalAction='approve'|'reject'|'defer';
export interface ApprovalCommandInput { recommendationId:string; actorId:string; action:ApprovalAction; note?:string; idempotencyKey:string; }
export interface ApprovalCommandResult { recommendationId:string; status:RecommendationStatus; idempotencyKey:string; }
const target:Record<ApprovalAction,RecommendationStatus>={approve:'approved',reject:'rejected',defer:'deferred'};
export function normalizeApprovalCommand(input:ApprovalCommandInput):ApprovalCommandInput{
 if(!input.recommendationId.trim())throw new Error('RECOMMENDATION_ID_REQUIRED');
 if(!input.actorId.trim())throw new Error('APPROVAL_ACTOR_REQUIRED');
 if(!input.idempotencyKey.trim())throw new Error('APPROVAL_IDEMPOTENCY_REQUIRED');
 if(input.note&&input.note.length>2000)throw new Error('APPROVAL_NOTE_TOO_LONG');
 return {...input,recommendationId:input.recommendationId.trim(),actorId:input.actorId.trim(),idempotencyKey:input.idempotencyKey.trim(),note:input.note?.trim()||undefined};
}
export function targetStatusForApproval(action:ApprovalAction):RecommendationStatus{return target[action];}
