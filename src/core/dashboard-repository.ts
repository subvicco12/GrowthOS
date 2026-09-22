import type { ActionItem, ApprovalInboxItem } from './action-center';
import { buildNextBestActions, buildApprovalInbox } from './action-center';
import type { OperationalCounts, IntegrationHealth } from './operational-dashboard';
export interface DashboardQuery {
 siteId?:string;
 recommendations:ActionItem[];
 approvals:ApprovalInboxItem[];
 integrations:IntegrationHealth[];
 counts:OperationalCounts;
 activeJobs:number;
}
export interface DashboardSnapshot {
 counts:OperationalCounts;
 activeJobs:number;
 nextBestActions:ActionItem[];
 approvalInbox:ApprovalInboxItem[];
 integrations:IntegrationHealth[];
 generatedAt:string;
}
export function buildDashboardSnapshot(input:DashboardQuery,now=new Date()):DashboardSnapshot {
 return {counts:{...input.counts,activeJobs:input.activeJobs},activeJobs:input.activeJobs,nextBestActions:buildNextBestActions(input.recommendations),approvalInbox:buildApprovalInbox(input.approvals),integrations:[...input.integrations],generatedAt:now.toISOString()};
}
export interface DashboardSql { query<T=unknown>(sql:string,params?:unknown[]):Promise<{rows:T[]}>; }
export class PostgresDashboardRepository {
 constructor(private readonly db:DashboardSql){}
 async load(siteId?:string):Promise<DashboardQuery>{
  const params=siteId?[siteId]:[];
  const where=siteId?' where site_id=$1':'';
  const rec=await this.db.query<any>(`select id,site_id,category,title,score,approval_class,status,evidence,impact,confidence,effort,risk from public.recommendations${where} and status not in ('rejected','verified') order by score desc`.replace(' where site_id=$1 and',' where site_id=$1 and'),params);
  const jobs=await this.db.query<{count:string}>(`select count(*)::text as count from public.jobs where status in ('queued','running')${siteId?' and site_id=$1':''}`,params);
  const mapped=rec.rows.map(r=>({id:r.id,siteId:r.site_id,title:r.title,category:r.category,score:Number(r.score),approvalClass:r.approval_class,status:r.status,reason:r.title,evidence:r.evidence??[],impact:r.impact,confidence:r.confidence,effort:r.effort,risk:r.risk}));
  const counts={needsApproval:mapped.filter(x=>x.status==='proposed'&&x.approvalClass!=='green').length,inDevelopment:0,inProduction:0,qaFailed:0,readyForReview:0,readyForListing:0,readyToPublish:0,live:0,exceptions:0,activeJobs:Number(jobs.rows[0]?.count??0)};
  return {recommendations:mapped,approvals:mapped.filter(x=>x.status==='proposed') as ApprovalInboxItem[],integrations:[],counts,activeJobs:counts.activeJobs};
 }
}
