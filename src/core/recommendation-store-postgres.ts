import type { RankedOpportunity } from './opportunities';
import type { RecommendationRecord, RecommendationStatus } from './recommendations';
export interface RecommendationSql { query<T=unknown>(sql:string,params?:unknown[]):Promise<{rows:T[]}>; }
type Row={id:string;site_id:string;category:RecommendationRecord['category'];title:string;evidence:string[];impact:number;confidence:number;effort:number;recurring_cost_usd:string|number;risk:number;score:string|number;approval_class:RecommendationRecord['approvalClass'];status:RecommendationStatus;created_at:string};
const map=(r:Row):RecommendationRecord=>({id:r.id,siteId:r.site_id,category:r.category,title:r.title,evidence:r.evidence,impact:r.impact,confidence:r.confidence,effort:r.effort,recurringCostUsd:Number(r.recurring_cost_usd),risk:r.risk,score:Number(r.score),approvalClass:r.approval_class,status:r.status,createdAt:r.created_at});
export class PostgresRecommendationRepository {
 constructor(private readonly db:RecommendationSql){}
 async create(input:RankedOpportunity):Promise<RecommendationRecord>{
  if(!input.evidence.length)throw new Error('RECOMMENDATION_EVIDENCE_REQUIRED');
  const q=await this.db.query<Row>(`insert into public.recommendations(site_id,category,title,evidence,impact,confidence,effort,recurring_cost_usd,risk,score,approval_class) values($1,$2,$3,$4::jsonb,$5,$6,$7,$8,$9,$10,$11) returning *`,[input.siteId,input.category,input.title,JSON.stringify(input.evidence),input.impact,input.confidence,input.effort,input.recurringCostUsd,input.risk,input.score,input.approvalClass]); return map(q.rows[0]);
 }
 async updateStatus(id:string,status:RecommendationStatus,note?:string):Promise<RecommendationRecord>{
  const q=await this.db.query<Row>(`update public.recommendations set status=$2 where id=$1 returning *`,[id,status]); if(!q.rows[0])throw new Error('RECOMMENDATION_NOT_FOUND'); void note; return map(q.rows[0]);
 }
}
