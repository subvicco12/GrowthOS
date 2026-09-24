import { buildDashboardSnapshot } from '../../../core/dashboard-repository';
import { validateDashboardSite } from '../../../core/dashboard-api';
import { readWordPressGrowthOSConfig, WordPressGrowthOSClient } from '../../../core/wordpress-growthos-client';

export async function GET(request:Request):Promise<Response>{
 const config=readWordPressGrowthOSConfig();
 if(!config)return Response.json({ok:false,code:'NEEDS_CONNECTION',message:'WordPress GrowthOS connection is not configured'},{status:503});
 try{
  const siteId=validateDashboardSite(new URL(request.url).searchParams.get('siteId')||undefined);
  const client=new WordPressGrowthOSClient(config);
  const [dashboard,recs,connectors]=await Promise.all([client.dashboard(siteId),client.recommendations(siteId),client.connectors(siteId)]);
  const rows=Array.isArray(recs)?recs:(recs.recommendations??recs.items??[]);
  const recommendations=rows.map((r:any)=>({id:String(r.id),siteId:String(r.site_id),title:r.title,category:r.category,score:Number(r.score??0),approvalClass:r.approval_class,status:r.status,reason:r.title,evidence:Array.isArray(r.evidence)?r.evidence:[],impact:Number(r.impact??0),confidence:Number(r.confidence??0),effort:Number(r.effort??0),risk:Number(r.risk??0)}));
  const connectorRows=connectors.connectors??connectors.items??[];
  const integrations=connectorRows.map((row:any)=>({name:row.kind,status:(row.status==='connected'?'healthy':row.status==='disabled'?'disabled':'attention') as 'healthy'|'attention'|'disabled',detail:row.status==='connected'?(row.last_seen_at?'Connected':'Connected; awaiting first heartbeat'):String(row.status).replaceAll('_',' ')}));
  const metrics=dashboard.metrics??{};
  const activeJobs=Number(metrics.queued_jobs??0);
  const counts={needsApproval:Number(metrics.pending_approvals??recommendations.filter((x:any)=>x.status==='proposed'&&x.approvalClass!=='green').length),inDevelopment:0,inProduction:0,qaFailed:0,readyForReview:0,readyForListing:0,readyToPublish:0,live:0,exceptions:Number(metrics.degraded_connectors??0),activeJobs};
  return Response.json({ok:true,data:buildDashboardSnapshot({counts,activeJobs,recommendations,approvals:recommendations.filter((x:any)=>x.status==='proposed'),integrations})});
 }catch(error){
  if(error instanceof Error&&error.message==='INVALID_SITE')return Response.json({ok:false,code:'INVALID_SITE',message:error.message},{status:400});
  if(error instanceof Error&&error.message==='WORDPRESS_UNAUTHORIZED')return Response.json({ok:false,code:'UNAUTHORIZED',message:'WordPress GrowthOS authentication failed'},{status:401});
  return Response.json({ok:false,code:'DASHBOARD_FAILED',message:'Dashboard data could not be loaded'},{status:502});
 }
}
