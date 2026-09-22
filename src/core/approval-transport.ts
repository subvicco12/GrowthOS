import { normalizeApprovalCommand, type ApprovalCommandInput } from './approval-command';
import { executeApprovalCommand, type ApprovalCommandService } from './approval-command-service';
export interface ApprovalTransportResponse {ok:boolean;status:number;code?:string;data?:unknown;}
export async function handleApprovalRequest(service:ApprovalCommandService,body:unknown):Promise<ApprovalTransportResponse>{
 try{
  if(!body||typeof body!=='object')return{ok:false,status:400,code:'INVALID_APPROVAL_REQUEST'};
  const input=normalizeApprovalCommand(body as ApprovalCommandInput);
  return {ok:true,status:200,data:await executeApprovalCommand(service,input)};
 }catch(error){
  const code=error instanceof Error?error.message:'APPROVAL_FAILED';
  const client=new Set(['APPROVAL_ACTOR_REQUIRED','APPROVAL_IDEMPOTENCY_REQUIRED','APPROVAL_IDEMPOTENCY_CONFLICT','INVALID_RECOMMENDATION_TRANSITION','APPROVAL_RESULT_STATUS_MISMATCH']);
  return {ok:false,status:client.has(code)?409:400,code};
 }
}
