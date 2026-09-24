import type { RecommendationRecord } from './recommendations';
import type { RecommendationDetail } from './recommendation-detail';
import { buildRecommendationDetail } from './recommendation-detail';
export interface RecommendationDetailSql { query<T=unknown>(sql:string,params?:unknown[]):Promise<{rows:T[]}>; }
export class PostgresRecommendationDetailRepository {
 constructor(private readonly db:RecommendationDetailSql){}
 async get(id:string,siteId?:string):Promise<RecommendationDetail>{
  const q=siteId
   ?await this.db.query<any>(`select id,site_id,category,title,evidence,impact,confidence,effort,recurring_cost_usd,risk,score,approval_class,status,created_at from public.recommendations where id=$1 and site_id=$2`,[id,siteId])
   :await this.db.query<any>(`select id,site_id,category,title,evidence,impact,confidence,effort,recurring_cost_usd,risk,score,approval_class,status,created_at from public.recommendations where id=$1`,[id]);
  const r=q.rows[0]; if(!r)throw new Error('RECOMMENDATION_NOT_FOUND');
  const record:RecommendationRecord={id:r.id,siteId:r.site_id,category:r.category,title:r.title,evidence:r.evidence??[],impact:Number(r.impact),confidence:Number(r.confidence),effort:Number(r.effort),recurringCostUsd:Number(r.recurring_cost_usd),risk:Number(r.risk),score:Number(r.score),approvalClass:r.approval_class,status:r.status,createdAt:r.created_at};
  return buildRecommendationDetail(record);
 }
}
