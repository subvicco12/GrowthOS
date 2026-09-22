import type { RecommendationSql } from './recommendation-store-postgres';
import type { RecommendationStatus } from './recommendations';
export type ApprovalDecision='approved'|'rejected'|'deferred';
export class PostgresApprovalStore {
 constructor(private readonly db:RecommendationSql){}
 async record(input:{recommendationId:string;actorId:string;decision:ApprovalDecision;note?:string;idempotencyKey:string}):Promise<{id:string;created:boolean}>{
  if(!input.actorId.trim())throw new Error('APPROVAL_ACTOR_REQUIRED'); if(!input.idempotencyKey.trim())throw new Error('APPROVAL_IDEMPOTENCY_REQUIRED');
  const q=await this.db.query<{id:string;inserted:boolean}>(`insert into public.approvals(recommendation_id,actor_id,decision,note,idempotency_key) values($1,$2,$3,$4,$5) on conflict(idempotency_key) do update set id=public.approvals.id returning id,(xmax=0) as inserted`,[input.recommendationId,input.actorId,input.decision,input.note??null,input.idempotencyKey]); if(!q.rows[0])throw new Error('APPROVAL_PERSIST_FAILED'); return {id:q.rows[0].id,created:q.rows[0].inserted};
 }
}
export const statusForDecision=(decision:ApprovalDecision):RecommendationStatus=>decision;
