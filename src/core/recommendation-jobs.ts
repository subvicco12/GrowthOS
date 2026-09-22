import { randomUUID } from 'node:crypto';
import type { ExecutableRecommendation } from './recommendations';
export interface JobEnqueuer { enqueue(input:{id:string;siteId:string;type:string;idempotencyKey:string;payload:Record<string,unknown>;maxAttempts:number}):Promise<{id:string;created:boolean}>; }
export function recommendationJobKey(input:ExecutableRecommendation):string{return `recommendation:${input.recommendation.id}:${input.jobType}`;}
export async function enqueueRecommendation(enqueuer:JobEnqueuer,input:ExecutableRecommendation):Promise<{id:string;created:boolean}>{
 const siteId=input.recommendation.siteId;if(!siteId)throw new Error('RECOMMENDATION_SITE_REQUIRED');
 return enqueuer.enqueue({id:randomUUID(),siteId,type:input.jobType,idempotencyKey:recommendationJobKey(input),payload:input.payload,maxAttempts:3});
}
export interface QueueSql { query<T=unknown>(sql:string,params?:unknown[]):Promise<{rows:T[]}>; }
export class PostgresJobEnqueuer implements JobEnqueuer {
 constructor(private readonly db:QueueSql){}
 async enqueue(input:{id:string;siteId:string;type:string;idempotencyKey:string;payload:Record<string,unknown>;maxAttempts:number}):Promise<{id:string;created:boolean}>{
  const q=await this.db.query<{id:string;inserted:boolean}>(`insert into public.jobs(id,site_id,type,status,idempotency_key,payload,max_attempts,run_after) values($1,$2,$3,'queued',$4,$5::jsonb,$6,now()) on conflict(idempotency_key) do update set id=public.jobs.id returning id,(xmax=0) as inserted`,[input.id,input.siteId,input.type,input.idempotencyKey,JSON.stringify(input.payload),input.maxAttempts]);
  if(!q.rows[0])throw new Error('JOB_ENQUEUE_FAILED');return {id:q.rows[0].id,created:q.rows[0].inserted};
 }
}
