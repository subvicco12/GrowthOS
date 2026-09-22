import { randomUUID } from 'node:crypto';
import { assertApprovalTransition, type RecommendationRecord } from './recommendations';
import type { ApprovalDecision } from './approval-store-postgres';
import type { RecommendationSql } from './recommendation-store-postgres';
export interface ApprovalCommand { recommendationId:string; actorId:string; decision:ApprovalDecision; note?:string; idempotencyKey:string; }
export class PostgresRecommendationApprovalService {
 constructor(private readonly db:RecommendationSql){}
 async decide(input:ApprovalCommand):Promise<RecommendationRecord>{
  if(!input.actorId.trim())throw new Error('APPROVAL_ACTOR_REQUIRED'); if(!input.idempotencyKey.trim())throw new Error('APPROVAL_IDEMPOTENCY_REQUIRED');
  await this.db.query('begin');
  try{
   const current=await this.db.query<any>('select * from public.recommendations where id=$1 for update',[input.recommendationId]); const r=current.rows[0]; if(!r)throw new Error('RECOMMENDATION_NOT_FOUND');
   assertApprovalTransition(r.status,input.decision);
   await this.db.query(`insert into public.approvals(recommendation_id,actor_id,decision,note,idempotency_key) values($1,$2,$3,$4,$5) on conflict(idempotency_key) do nothing`,[input.recommendationId,input.actorId,input.decision,input.note??null,input.idempotencyKey]);
   const updated=await this.db.query<any>('update public.recommendations set status=$2 where id=$1 returning *',[input.recommendationId,input.decision]);
   await this.db.query(`insert into public.audit_events(id,actor_id,site_id,action,resource_type,resource_id,reason,before,after,created_at) values($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,now())`,[randomUUID(),input.actorId,r.site_id,'recommendation.decision','recommendation',input.recommendationId,input.note??input.decision,JSON.stringify({status:r.status}),JSON.stringify({status:input.decision})]);
   await this.db.query('commit');
   const u=updated.rows[0]; return {id:u.id,siteId:u.site_id,category:u.category,title:u.title,evidence:u.evidence,impact:u.impact,confidence:u.confidence,effort:u.effort,recurringCostUsd:Number(u.recurring_cost_usd),risk:u.risk,score:Number(u.score),approvalClass:u.approval_class,status:u.status,createdAt:u.created_at};
  }catch(error){await this.db.query('rollback');throw error;}
 }
}
