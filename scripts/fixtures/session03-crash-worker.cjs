// Test fixture: parent kills this process AFTER a real lease transaction commits.
const {assertSession03Runtime}=require('../../src/server/isolated-operations-http.ts');
const {getMySQLPool}=require('../../src/server/mysql.ts');
const {MySQLIsolatedOperations}=require('../../src/server/mysql-isolated-operations.ts');
(async()=>{
 assertSession03Runtime();if(process.env.GROWTHOS_CRASH_FIXTURE!=='YES')throw Error('TEST_FIXTURE_OPT_IN_REQUIRED');
 const service=new MySQLIsolatedOperations(getMySQLPool(),{read:async()=>{throw Error('NO_NETWORK_ADAPTER');}});
 await service.claim({organizationId:process.env.GROWTHOS_WORKER_ORGANIZATION_ID,websiteId:process.env.GROWTHOS_WORKER_WEBSITE_ID,actorId:process.env.GROWTHOS_WORKER_ACTOR_ID},process.env.GROWTHOS_TEST_JOB_ID);
 process.stdout.write('TEST_LEASE_CLAIMED\n');setInterval(()=>{},1000);
})().catch(error=>{console.error(error.code||error.message);process.exit(1);});
