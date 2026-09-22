import type { ApprovalCommandService } from './approval-command-service';
import { handleApprovalRequest } from './approval-transport';
export interface AuthenticatedActor {id:string;role:string;}
export interface ApprovalRouteDeps {service:ApprovalCommandService;authenticate(request:Request):Promise<AuthenticatedActor|null>;}
export function createApprovalRoute(deps:ApprovalRouteDeps){
 return async function POST(request:Request):Promise<Response>{
  const actor=await deps.authenticate(request);
  if(!actor)return Response.json({ok:false,code:'UNAUTHENTICATED'},{status:401});
  if(!['owner','admin'].includes(actor.role))return Response.json({ok:false,code:'FORBIDDEN'},{status:403});
  let body:unknown; try{body=await request.json();}catch{return Response.json({ok:false,code:'INVALID_JSON'},{status:400});}
  if(!body||typeof body!=='object')return Response.json({ok:false,code:'INVALID_APPROVAL_REQUEST'},{status:400});
  const record=body as Record<string,unknown>;
  if('actorId' in record)return Response.json({ok:false,code:'CLIENT_ACTOR_FORBIDDEN'},{status:400});
  const result=await handleApprovalRequest(deps.service,{...record,actorId:actor.id});
  return Response.json(result,{status:result.status});
 };
}
