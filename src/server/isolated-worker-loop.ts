import type { WorkScope } from './mysql-isolated-workflows';
export interface IsolatedWorker { tick(scope:WorkScope,signal?:AbortSignal):Promise<{processed:number}> }
export async function runIsolatedWorkerLoop(worker:IsolatedWorker,scope:WorkScope,options:{iterations:number;intervalMs:number;signal:AbortSignal}){
 if(!Number.isInteger(options.iterations)||options.iterations<1||options.iterations>60||!Number.isInteger(options.intervalMs)||options.intervalMs<100||options.intervalMs>5000)throw Error('WORKER_LIMIT_INVALID');
 let processed=0,cycles=0;
 for(let i=0;i<options.iterations&&!options.signal.aborted;i++){
  const result=await worker.tick(scope,options.signal);processed+=result.processed;cycles++;
  if(i+1<options.iterations&&!options.signal.aborted)await new Promise<void>(resolve=>{
   const done=()=>{clearTimeout(timer);options.signal.removeEventListener('abort',done);resolve();};
   const timer=setTimeout(done,options.intervalMs);options.signal.addEventListener('abort',done,{once:true});if(options.signal.aborted)done();
  });
 }
 return {processed,cycles,stopped:options.signal.aborted,externalAction:false};
}
