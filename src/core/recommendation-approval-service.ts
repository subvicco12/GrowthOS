import { randomUUID } from 'node:crypto';
import { assertApprovalTransition, type RecommendationRecord } from './recommendations';
import type { ApprovalDecision } from './approval-store-postgres';
import type { RecommendationSql } from './recommendation-store-postgres';
export interface ApprovalCommand { recommendationId:string; actorId:string; decision:ApprovalDecision; note?:string; idempotencyKey:string; }
function mapRecommendation(u:any):RecommendationRecord{return {id:u.id,siteId:u.site_id,category:u.category,title:u.title,evidence:u.evidence,impact:u.impact,confidence:u.confidence,effort:u.effort,recurringCostUsd:Number(u.recurring_cost_usd),risk:u.risk,score:Number(u.score),approvalClass:u.approval_class,status:u.status,createdAt:u.created_at};}
export class PostgresRecommendationApprovalService {
 constructor(private readonly db:RecommendationSql){}
 async decide(input:ApprovalCommand):Promise<RecommendationRecord>{
  if(!input.actorId.trim())throw new Error('APPROVAL_ACTOR_REQUIRED'); if(!input.idempotencyKey.trim())throw new Error('APPROVAL_IDEMPOTENCY_REQUIRED');
  await this.db.query('begin');
  try{
   const prior=await this.db.query<any>('select recommendation_id,actor_id,decision from public.approvals where idempotency_key=$1',[input.idempotencyKey]);
   if(prior.rows[0]){
    const p=prior.rows[0]; if(p.recommendation_id!==input.recommendationId||p.actor_id!==input.actorId||p.decision!==input.decision)throw new Error('APPROVAL_IDEMPOTENCY_CONFLICT');
    const existing=await this.db.query<any>('select * from public.recommendations where id=$1',[input.recommendationId]); if(!existing.rows[0])throw new Error('RECOMMENDATION_NOT_FOUND');
    await this.db.query('commit'); return mapRecommendation(existing.rows[0]);
   }
   const current=await this.db.query<any>('select * from public.recommendations where id=$1 for update',[input.recommendationId]); const r=current.rows[0]; if(!r)throw new Error('RECOMMENDATION_NOT_FOUND');
   assertApprovalTransition(r.status,input.decision);
   const inserted=await this.db.query<any>(`insert into public.approvals(recommendation_id,actor_id,decision,note,idempotency_key) values($1,$2,$3,$4,$5) on conflict(idempotency_key) do nothing returning recommendation_id`,[input.recommendationId,input.actorId,input.decision,input.note??null,input.idempotencyKey]);
   if(!inserted.rows[0]){
    const raced=await this.db.query<any>('select recommendation_id,actor_id,decision from public.approvals where idempotency_key=$1',[input.idempotencyKey]); const p=raced.rows[0];
    if(!p||p.recommendation_id!==input.recommendationId||p.actor_id!==input.actorId||p.decision!==input.decision)throw new Error('APPROVAL_IDEMPOTENCY_CONFLICT');
    await this.db.query('commit'); return mapRecommendation(r);
   }
   const updated=await this.db.query<any>('update public.recommendations set status=$2 where id=$1 returning *',[input.recommendationId,input.decision]);
   await this.db.query(`insert into public.audit_events(id,actor_id,site_id,action,resource_type,resource_id,reason,before,after,created_at) values($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,now())`,[randomUUID(),input.actorId,r.site_id,'recommendation.decision','recommendation',input.recommendationId,input.note??input.decision,JSON.stringify({status:r.status}),JSON.stringify({status:input.decision})]);
   await this.db.query('commit'); return mapRecommendation(updated.rows[0]);
  }catch(error){await this.db.query('rollback');throw error;}
 }
}
