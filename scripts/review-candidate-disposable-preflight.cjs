#!/usr/bin/env node
'use strict';
/** Candidate 010–016 preflight. --probe executes SELECT/SHOW only; never installs SQL. */
const {verify}=require('./verify-review-migration-chain-offline.cjs');
function assertDisposable(env){
 if(env.GROWTHOS_CANDIDATE_CERTIFICATION!=='EXPLICIT_DISPOSABLE_REVIEW_ONLY')throw Error('EXPLICIT_CERTIFICATION_OPT_IN_REQUIRED');
 if(env.GROWTHOS_CANDIDATE_ISOLATION_VERIFIED!=='YES')throw Error('INDEPENDENT_ISOLATION_VERIFICATION_REQUIRED');
 if(env.GROWTHOS_DB_HOST!=='127.0.0.1'||!/^[1-9][0-9]{1,4}$/.test(env.GROWTHOS_DB_PORT||'')||
   Number(env.GROWTHOS_DB_PORT)>65535)throw Error('LOOPBACK_TCP_REQUIRED');
 if(!/^growthos_test_[a-z0-9_]{4,40}$/.test(env.GROWTHOS_DB_NAME||''))throw Error('DISPOSABLE_SCHEMA_REQUIRED');
 if(!/^synthetic_[a-z0-9_]{4,40}$/.test(env.GROWTHOS_DB_USER||'')||
   !/^synthetic_[A-Za-z0-9_-]{12,}$/.test(env.GROWTHOS_DB_PASSWORD||''))throw Error('SYNTHETIC_CREDENTIALS_REQUIRED');
 if(env.GROWTHOS_PRODUCTION_APPROVAL||env.DATABASE_URL)throw Error('PRODUCTION_CONFIGURATION_PRESENT');
 return {host:env.GROWTHOS_DB_HOST,port:Number(env.GROWTHOS_DB_PORT),database:env.GROWTHOS_DB_NAME,
  user:env.GROWTHOS_DB_USER,password:env.GROWTHOS_DB_PASSWORD};
}
async function probe(env){
 verify();const options=assertDisposable(env);
 const mysql=require('mysql2/promise');
 const shared={...options,multipleStatements:false,connectTimeout:3000,timezone:'Z'};
 const a=await mysql.createConnection(shared);let b;
 try{
  b=await mysql.createConnection(shared);
  const [[identity]]=await a.query('SELECT DATABASE() AS db, VERSION() AS version, @@bind_address AS bind_address, CONNECTION_ID() AS connection_id');
  const [[second]]=await b.query('SELECT DATABASE() AS db, CONNECTION_ID() AS connection_id');
  if(identity.db!==options.database||second.db!==options.database||
    !/^11\.8\.\d+.*MariaDB/i.test(identity.version)||identity.bind_address!=='127.0.0.1'||
    identity.connection_id===second.connection_id)throw Error('DATABASE_IDENTITY_OR_SESSION_MISMATCH');
  const [tables]=await a.execute('SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA=?',[options.database]);
  const [triggers]=await a.execute('SELECT TRIGGER_NAME FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=?',[options.database]);
  if(tables.length||triggers.length)throw Error('SCHEMA_NOT_EMPTY');
  const [grants]=await a.query('SHOW GRANTS');
  return {status:'PREFLIGHT_ONLY_NO_SQL_INSTALLED',version:identity.version,distinctSessions:true,
    emptySchema:true,grantStatements:grants.length};
 }finally{await Promise.allSettled([a.end(),b?.end()]);}
}
module.exports={assertDisposable,probe};
if(require.main===module){
 (async()=>{
  if(process.argv.length!==3||!['--plan','--probe'].includes(process.argv[2]))throw Error('NO_INSTALL_MODE');
  if(process.argv[2]==='--plan')console.log(JSON.stringify({status:'PLAN_ONLY',chain:verify().expectedCompleteSchema,
   next:'operator must independently verify isolated server, then run --probe; no installer in this package'}));
  else console.log(JSON.stringify(await probe(process.env)));
 })().catch(error=>{console.error('REFUSED: '+error.message+'; no SQL installed');process.exitCode=2;});
}
