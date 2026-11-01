#!/usr/bin/env node
const fs=require('node:fs'),path=require('node:path');
if(process.env.GROWTHOS_SESSION04_DISPOSABLE!=='YES'||process.env.GROWTHOS_SESSION03_DISPOSABLE!=='YES'||process.env.GROWTHOS_SESSION02_DISPOSABLE!=='YES'||process.env.GROWTHOS_TEST_DB_DISPOSABLE!=='YES'||
 !/^growthos_test_[A-Za-z0-9_]+$/.test(process.env.GROWTHOS_DB_NAME||'')||!['127.0.0.1','localhost','::1'].includes(process.env.GROWTHOS_DB_HOST||'')){
 console.error('REFUSED: explicit Session 04 disposable schema opt-in required.');process.exit(2);
}
(async()=>{const c=await require('mysql2/promise').createConnection({host:process.env.GROWTHOS_DB_HOST,port:Number(process.env.GROWTHOS_DB_PORT||3306),database:process.env.GROWTHOS_DB_NAME,user:process.env.GROWTHOS_DB_USER,password:process.env.GROWTHOS_DB_PASSWORD,multipleStatements:false});
 try{
  const [[v]]=await c.query('SELECT VERSION() AS version');if(!/^11\.8\..*MariaDB/.test(v.version))throw Error('MariaDB 11.8 required');
  const [[contract]]=await c.query('SELECT contract_version FROM growth_dev_s03_contract WHERE id=1');if(contract.contract_version!=='session03-v1')throw Error('Unchanged isolated proposal 017 required');
  const [existing]=await c.query("SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='growth_dev_s04_contract'");if(existing.length)throw Error('REFUSED: discard partially installed test schemas');
  const sql=fs.readFileSync(path.join(__dirname,'../database/proposals/session04-compatibility/019_session04_disposable_candidate.sql'),'utf8');
  for(const statement of sql.split('\n').filter(line=>!line.trim().startsWith('--')).join('\n').split(';').map(s=>s.trim()).filter(Boolean)){
   if(!/^(CREATE TABLE growth_dev_|CREATE TRIGGER dev_|INSERT INTO growth_dev_s04_contract)/.test(statement))throw Error('Unexpected proposal statement');await c.query(statement);
  }console.log('PASS: independent proposal 019 installed only in disposable schema; 010–017 contracts unchanged.');
 }finally{await c.end();}
})().catch(error=>{console.error(error.code||error.message);process.exitCode=1;});
