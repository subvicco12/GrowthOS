import { createClient } from '@supabase/supabase-js';
import type { ApprovalCommandService } from './approval-command-service';
import type { ApprovalCommandInput } from './approval-command';
import { buildRecommendationDetail, type RecommendationDetail } from './recommendation-detail';
import { readServerDatabaseConfig } from './server-config';
export function createApprovalRpcService():ApprovalCommandService|null{
 const config=readServerDatabaseConfig(); if(!config)return null;
 const client=createClient(config.url,config.serviceRoleKey,{auth:{persistSession:false,autoRefreshToken:false}});
 return {async decide(input:ApprovalCommandInput):Promise<RecommendationDetail>{
  const decision=input.action==='approve'?'approved':input.action==='reject'?'rejected':'deferred';
  const {data,error}=await client.rpc('decide_recommendation',{p_recommendation_id:input.recommendationId,p_actor_id:input.actorId,p_decision:decision,p_note:input.note??null,p_idempotency_key:input.idempotencyKey});
  if(error){
   const message=error.message||'APPROVAL_PERSISTENCE_FAILED';
   for(const code of ['APPROVAL_IDEMPOTENCY_CONFLICT','RECOMMENDATION_NOT_FOUND','INVALID_RECOMMENDATION_TRANSITION','APPROVAL_INPUT_INVALID','APPROVAL_DECISION_INVALID','APPROVAL_ACTOR_FORBIDDEN'])if(message.includes(code))throw new Error(code);
   throw new Error('APPROVAL_PERSISTENCE_FAILED');
  }
  const row=Array.isArray(data)?data[0]:data; if(!row)throw new Error('RECOMMENDATION_NOT_FOUND');
  return buildRecommendationDetail({id:row.id,siteId:row.site_id,category:row.category,title:row.title,evidence:row.evidence,impact:row.impact,confidence:row.confidence,effort:row.effort,recurringCostUsd:Number(row.recurring_cost_usd),risk:row.risk,score:Number(row.score),approvalClass:row.approval_class,status:row.status,createdAt:row.created_at});
 }};
}
