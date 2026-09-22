import { normalizeApprovalCommand, type ApprovalCommandInput } from './approval-command';
import { executeApprovalCommand, type ApprovalCommandService } from './approval-command-service';
export interface ApprovalTransportResponse {ok:boolean;status:number;code?:string;data?:unknown;}
const badRequest=new Set(['RECOMMENDATION_ID_REQUIRED','APPROVAL_ACTOR_REQUIRED','APPROVAL_IDEMPOTENCY_REQUIRED','APPROVAL_NOTE_TOO_LONG','APPROVAL_INPUT_INVALID','APPROVAL_DECISION_INVALID']);
const conflict=new Set(['APPROVAL_IDEMPOTENCY_CONFLICT','INVALID_RECOMMENDATION_TRANSITION','APPROVAL_RESULT_STATUS_MISMATCH']);
export async function handleApprovalRequest(service:ApprovalCommandService,body:unknown):Promise<ApprovalTransportResponse>{
 try{
  if(!body||typeof body!=='object')return{ok:false,status:400,code:'INVALID_APPROVAL_REQUEST'};
  const input=normalizeApprovalCommand(body as ApprovalCommandInput);
  return {ok:true,status:200,data:await executeApprovalCommand(service,input)};
 }catch(error){
  const code=error instanceof Error?error.message:'APPROVAL_FAILED';
  if(code==='RECOMMENDATION_NOT_FOUND')return{ok:false,status:404,code};
  if(conflict.has(code))return{ok:false,status:409,code};
  if(badRequest.has(code))return{ok:false,status:400,code};
  return{ok:false,status:500,code:'APPROVAL_FAILED'};
 }
}
