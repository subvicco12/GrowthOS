import { createClient } from '@supabase/supabase-js';
import { buildDashboardSnapshot } from '../../../core/dashboard-repository';
import { validateDashboardSite } from '../../../core/dashboard-api';
import { authenticateSupabaseRequest } from '../../../core/supabase-server-auth';
import { readServerDatabaseConfig } from '../../../core/server-config';

export async function GET(request:Request):Promise<Response>{
  const actor=await authenticateSupabaseRequest(request);
  if(!actor)return Response.json({ok:false,code:'UNAUTHORIZED',message:'Authentication required'},{status:401});
  const db=readServerDatabaseConfig();
  if(!db)return Response.json({ok:false,code:'NEEDS_CONNECTION',message:'Database connection is not configured'},{status:503});
  const siteId=new URL(request.url).searchParams.get('siteId')||undefined;
  try{
    validateDashboardSite(siteId);
    const client=createClient(db.url,db.serviceRoleKey,{auth:{persistSession:false,autoRefreshToken:false}});
    const recQuery=client.from('recommendations').select('id,site_id,category,title,score,approval_class,status,evidence,impact,confidence,effort,risk').not('status','in','("rejected","verified")').order('score',{ascending:false});
    const jobsQuery=client.from('jobs').select('id,site_id,status').in('status',['queued','running']);
    const connectorQuery=client.from('connectors').select('kind,status,last_seen_at').order('kind');
    const [rec,jobs,connectors]=await Promise.all([siteId?recQuery.eq('site_id',siteId):recQuery,siteId?jobsQuery.eq('site_id',siteId):jobsQuery,siteId?connectorQuery.eq('site_id',siteId):connectorQuery]);
    if(rec.error||jobs.error||connectors.error)throw rec.error||jobs.error||connectors.error;
    const recommendations=(rec.data??[]).map((r:any)=>({id:r.id,siteId:r.site_id,title:r.title,category:r.category,score:Number(r.score),approvalClass:r.approval_class,status:r.status,reason:r.title,evidence:r.evidence??[],impact:Number(r.impact??0),confidence:Number(r.confidence??0),effort:Number(r.effort??0),risk:Number(r.risk??0)}));
    const activeJobs=(jobs.data??[]).length;
    const counts={needsApproval:recommendations.filter((x:any)=>x.status==='proposed'&&x.approvalClass!=='green').length,inDevelopment:0,inProduction:0,qaFailed:0,readyForReview:0,readyForListing:0,readyToPublish:0,live:0,exceptions:0,activeJobs};
    const integrations=(connectors.data??[]).map((row:any)=>({name:row.kind,status:row.status==='connected'?'healthy':row.status==='disabled'?'disabled':'attention',detail:row.status==='connected'?(row.last_seen_at?'Connected':'Connected; awaiting first heartbeat'):String(row.status).replaceAll('_',' ')}));
    return Response.json({ok:true,data:buildDashboardSnapshot({counts,activeJobs,recommendations,approvals:recommendations.filter((x:any)=>x.status==='proposed'),integrations})});
  }catch(error){
    if(error instanceof Error&&error.message==='INVALID_SITE')return Response.json({ok:false,code:'INVALID_SITE',message:error.message},{status:400});
    return Response.json({ok:false,code:'DASHBOARD_FAILED',message:'Dashboard data could not be loaded'},{status:500});
  }
}
