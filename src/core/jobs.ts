import type { Job } from './types';

export interface JobStore {
  claim(workerId:string,leaseSeconds:number):Promise<Job|null>;
  succeed(jobId:string,result:unknown):Promise<void>;
  fail(jobId:string,error:string,retryAt?:Date):Promise<void>;
  extendLease?(jobId:string,workerId:string,leaseSeconds:number):Promise<boolean>;
}
export type JobHandler=(job:Job)=>Promise<unknown>;
export class PermanentJobError extends Error {}
export function retryDelayMs(attempts:number):number { return Math.min(60_000*2**Math.max(0,attempts),30*60_000); }
export function sanitizeJobError(error:unknown):string {
  const raw=error instanceof Error?error.message:'UNKNOWN_JOB_ERROR';
  return raw.replace(/(authorization|cookie|password|secret|token|api[_-]?key)\s*[:=]\s*[^\s,;]+/gi,'$1=[REDACTED]').slice(0,1000);
}
export class JobRunner {
  constructor(private readonly store:JobStore,private readonly handlers:Record<string,JobHandler>){}
  async runOne(workerId:string):Promise<'idle'|'succeeded'|'failed'> {
    const job=await this.store.claim(workerId,120);
    if(!job)return'idle';
    const handler=this.handlers[job.type];
    if(!handler){await this.store.fail(job.id,`UNKNOWN_JOB_TYPE:${job.type}`);return'failed';}
    try {const result=await handler(job);await this.store.succeed(job.id,result);return'succeeded';}
    catch(error){
      const retry=!(error instanceof PermanentJobError)&&job.attempts+1<job.maxAttempts;
      await this.store.fail(job.id,sanitizeJobError(error),retry?new Date(Date.now()+retryDelayMs(job.attempts)):undefined);
      return'failed';
    }
  }
}
