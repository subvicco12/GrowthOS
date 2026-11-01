#!/usr/bin/env node
// Versioned reversible quarantine tooling. Requires --import=tsx and explicit disposable flags.
const fs=require('node:fs'),{assertSession04Runtime}=require('../src/server/session04-http.ts'),{getMySQLPool}=require('../src/server/mysql.ts'),{Session04Portfolio}=require('../src/server/session04-portfolio.ts'),{validateReviewBundle}=require('../src/core/review-bundle.ts');
(async()=>{assertSession04Runtime();const[mode,file]=process.argv.slice(2),org=process.env.GROWTHOS_WORKER_ORGANIZATION_ID,site=process.env.GROWTHOS_WORKER_WEBSITE_ID,actor=process.env.GROWTHOS_WORKER_ACTOR_ID;
 if(!['validate','export','stage','revert'].includes(mode))throw Error('MODE_REQUIRED');
 if(mode==='validate'){if(!file||fs.statSync(file).size>1800000)throw Error('BUNDLE_FILE_LIMIT');const bundle=validateReviewBundle(JSON.parse(fs.readFileSync(file,'utf8')),org,site);console.log('PASS: '+bundle.records.length+' records, quarantine-only, no DB connection');return;}
 const pool=getMySQLPool();try{const service=new Session04Portfolio(pool);if(mode==='export'){const bundle=await service.exportBundle(org,site,actor);fs.writeFileSync(file,JSON.stringify(bundle,null,2),{mode:0o600,flag:'wx'});console.log('Exported unverified/internal evidence; no authority or credentials');}
 else if(mode==='stage'){if(fs.statSync(file).size>1800000)throw Error('BUNDLE_FILE_LIMIT');console.log(await service.stageBundle(org,site,actor,process.env.GROWTHOS_BRIDGE_REQUEST_KEY,JSON.parse(fs.readFileSync(file,'utf8'))));}
 else console.log(await service.revertBundle(org,site,actor,process.env.GROWTHOS_BRIDGE_BATCH_ID));}finally{await pool.end();}
})().catch(error=>{console.error(error instanceof Error?error.message:'BUNDLE_TOOL_FAILED');process.exitCode=2;});
