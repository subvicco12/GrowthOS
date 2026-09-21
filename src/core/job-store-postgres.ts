import type { Job } from './types';

export interface SqlExecutor { query<T=Record<string,unknown>>(sql:string,params?:unknown[]):Promise<{rows:T[]}>; }

type JobRow={id:string;site_id:string|null;type:string;status:Job['status'];idempotency_key:string;attempts:number;max_attempts:number;created_at:string};

function mapJob(row:JobRow):Job{return {id:row.id,siteId:row.site_id??undefined,type:row.type,status:row.status,idempotencyKey:row.idempotency_key,attempts:row.attempts,maxAttempts:row.max_attempts,createdAt:row.created_at};}

export class PostgresJobStore {
  constructor(private readonly db:SqlExecutor){}
  async claim(workerId:string,leaseSeconds:number):Promise<Job|null>{
    if(!workerId.trim()||!Number.isSafeInteger(leaseSeconds)||leaseSeconds<1||leaseSeconds>3600) throw new Error('INVALID_JOB_LEASE');
    const {rows}=await this.db.query<JobRow>(`
      with candidate as (
        select id from public.jobs
        where (status='queued' and run_after<=now())
           or (status='running' and locked_until<now())
        order by run_after,created_at
        for update skip locked limit 1
      )
      update public.jobs j set status='running',locked_by=$1,locked_until=now()+($2 * interval '1 second'),attempts=j.attempts+1,updated_at=now()
      from candidate where j.id=candidate.id
      returning j.id,j.site_id,j.type,j.status,j.idempotency_key,j.attempts,j.max_attempts,j.created_at
    `,[workerId,leaseSeconds]);
    return rows[0]?mapJob(rows[0]):null;
  }
  async succeed(jobId:string,result:unknown):Promise<void>{
    await this.db.query(`update public.jobs set status='succeeded',result=$2::jsonb,locked_by=null,locked_until=null,updated_at=now() where id=$1 and status='running'`,[jobId,JSON.stringify(result??null)]);
  }
  async fail(jobId:string,error:string,retryAt?:Date):Promise<void>{
    const status=retryAt?'queued':'failed';
    await this.db.query(`update public.jobs set status=$2::public.job_status,result=jsonb_build_object('error',$3::text),run_after=coalesce($4::timestamptz,run_after),locked_by=null,locked_until=null,updated_at=now() where id=$1 and status='running'`,[jobId,status,error,retryAt?.toISOString()??null]);
  }
  async extendLease(jobId:string,workerId:string,leaseSeconds:number):Promise<boolean>{
    const {rows}=await this.db.query<{id:string}>(`update public.jobs set locked_until=now()+($3 * interval '1 second'),updated_at=now() where id=$1 and status='running' and locked_by=$2 returning id`,[jobId,workerId,leaseSeconds]);
    return rows.length===1;
  }
}
