export interface ApprovalActionRequest { recommendationId:string; action:'approve'|'reject'|'defer'; idempotencyKey:string; note?:string; }
export function approvalRequest(input:ApprovalActionRequest):ApprovalActionRequest{
 if(!input.recommendationId||!input.idempotencyKey)throw new Error('APPROVAL_REQUEST_INVALID');
 return {...input};
}
