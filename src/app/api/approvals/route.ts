import { createApprovalRoute } from '../../../core/approval-route';
import { createApprovalRpcService } from '../../../core/approval-rpc-service';
import { authenticateSupabaseRequest } from '../../../core/supabase-server-auth';
export async function POST(request:Request):Promise<Response>{
 const service=createApprovalRpcService();
 if(!service)return Response.json({ok:false,code:'NEEDS_CONNECTION'},{status:503});
 return createApprovalRoute({service,authenticate:authenticateSupabaseRequest})(request);
}
