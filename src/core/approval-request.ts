export interface ApprovalActionRequest { recommendationId:string; action:'approve'|'reject'|'defer'; idempotencyKey:string; note?:string; }
export function approvalRequest(input:ApprovalActionRequest):ApprovalActionRequest{
 if(!input.recommendationId||!input.idempotencyKey||input.idempotencyKey.length>128||(input.note?.length??0)>2000)throw new Error('APPROVAL_REQUEST_INVALID');
 return {...input};
}
