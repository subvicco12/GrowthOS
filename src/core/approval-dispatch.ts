import type { ApprovalAction } from './approval-command';
import { normalizeApprovalCommand } from './approval-command';
export interface ApprovalDispatch { recommendationId:string; action:ApprovalAction; actorId:string; note?:string; idempotencyKey:string; }
export function buildApprovalDispatch(input:ApprovalDispatch){ const normalized=normalizeApprovalCommand({recommendationId:input.recommendationId,actorId:input.actorId,action:input.action,note:input.note,idempotencyKey:input.idempotencyKey}); return {recommendationId:normalized.recommendationId,action:normalized.action,actorId:normalized.actorId,note:normalized.note,idempotencyKey:normalized.idempotencyKey}; }
