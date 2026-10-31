#!/usr/bin/env node
// Run with node --import=tsx. Bounded synthetic-only loop, no service registration.
const {assertSession03Runtime}=require('../src/server/isolated-operations-http.ts');
const {workflowScope}=require('../src/core/isolated-workflows.ts');
const {getMySQLPool}=require('../src/server/mysql.ts');
const {MySQLIsolatedOperations}=require('../src/server/mysql-isolated-operations.ts');
const {runIsolatedWorkerLoop}=require('../src/server/isolated-worker-loop.ts');
(async()=>{
 assertSession03Runtime();const scope=workflowScope.parse({organizationId:process.env.GROWTHOS_WORKER_ORGANIZATION_ID,websiteId:process.env.GROWTHOS_WORKER_WEBSITE_ID});
 const actorId=process.env.GROWTHOS_WORKER_ACTOR_ID||'';if(!/^[a-f0-9-]{36}$/.test(actorId))throw Error('WORKER_ACTOR_REQUIRED');
 const controller=new AbortController();process.once('SIGINT',()=>controller.abort());process.once('SIGTERM',()=>controller.abort());const pool=getMySQLPool();
 try{console.log(await runIsolatedWorkerLoop(new MySQLIsolatedOperations(pool,{read:async()=>{throw Error('NO_NETWORK_ADAPTER');}}),{...scope,actorId},
  {iterations:Number(process.env.GROWTHOS_WORKER_ITERATIONS||'1'),intervalMs:Number(process.env.GROWTHOS_WORKER_INTERVAL_MS||'1000'),signal:controller.signal}));}finally{await pool.end();}
})().catch(error=>{console.error(error instanceof Error?error.message:'WORKER_FAILED');process.exitCode=2;});
