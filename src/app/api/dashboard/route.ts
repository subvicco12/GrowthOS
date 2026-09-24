import { createClient } from '@supabase/supabase-js';
import { PostgresDashboardRepository } from '../../../core/dashboard-repository';
import { dashboardResponse, validateDashboardSite } from '../../../core/dashboard-api';
import { authenticateSupabaseRequest } from '../../../core/supabase-server-auth';
import { readServerDatabaseConfig } from '../../../core/server-config';

export async function GET(request:Request):Promise<Response>{
  const actor=await authenticateSupabaseRequest(request);
  if(!actor)return Response.json({ok:false,code:'UNAUTHORIZED',message:'Authentication required'},{status:401});
  const db=readServerDatabaseConfig();
  if(!db)return Response.json({ok:false,code:'NEEDS_CONNECTION',message:'Database connection is not configured'},{status:503});
  const url=new URL(request.url);
  const siteId=url.searchParams.get('siteId')||undefined;
  try{
    validateDashboardSite(siteId);
    const client=createClient(db.url,db.serviceRoleKey,{auth:{persistSession:false,autoRefreshToken:false}});
    const repository=new PostgresDashboardRepository({query:async<T>(sql:string,params?:unknown[])=>{
      const rpc=await client.rpc('growthos_dashboard_query',{p_sql:sql,p_params:params??[]});
      if(rpc.error)throw rpc.error;
      return {rows:(rpc.data??[]) as T[]};
    }});
    const snapshot=await repository.load(siteId);
    return Response.json(dashboardResponse(snapshot),{status:200});
  }catch(error){
    if(error instanceof Error&&error.message==='INVALID_SITE')return Response.json({ok:false,code:'INVALID_SITE',message:error.message},{status:400});
    return Response.json({ok:false,code:'DASHBOARD_FAILED',message:'Dashboard data could not be loaded'},{status:500});
  }
}
