#!/usr/bin/env node
'use strict';
// Offline safety regression tests; no DB connection and no production credentials.
const assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
const path=require('node:path');
const fs=require('node:fs');
const os=require('node:os');
const runner=path.join(__dirname,'production-migration-executor-candidate.cjs');
function run(args,env={}){
 const clean={PATH:process.env.PATH,HOME:process.env.HOME};
 return spawnSync(process.execPath,[runner,...args],{encoding:'utf8',env:{...clean,...env},timeout:10000});
}
const plan=run(['--plan']);
assert.equal(plan.status,0,plan.stderr);
const parsed=JSON.parse(plan.stdout);
assert.equal(parsed.productionExecutionEnabled,false);
assert.equal(parsed.migrations.length,9);
assert.equal(parsed.migrations.reduce((n,m)=>n+m.statementCount,0),19);
const negative=[
 [{},'disposable confirmation missing'],
 [{GROWTHOS_MIGRATION_TEST_DISPOSABLE:'YES',GROWTHOS_DB_NAME:'u917733804_growthos_prod'},'database must be growthos_test_*'],
 [{GROWTHOS_MIGRATION_TEST_DISPOSABLE:'YES',GROWTHOS_DB_NAME:'growthos_test_synthetic',GROWTHOS_DB_HOST:'production.example.com'},'local loopback host required'],
 [{GROWTHOS_MIGRATION_TEST_DISPOSABLE:'YES',GROWTHOS_DB_NAME:'growthos_test_synthetic',GROWTHOS_DB_HOST:'127.0.0.1'},'explicit valid local port required'],
 [{GROWTHOS_MIGRATION_TEST_DISPOSABLE:'YES',GROWTHOS_DB_NAME:'growthos_test_synthetic',GROWTHOS_DB_HOST:'127.0.0.1',GROWTHOS_DB_PORT:'3307'},'synthetic credentials required'],
 [{GROWTHOS_MIGRATION_TEST_DISPOSABLE:'YES',GROWTHOS_DB_NAME:'growthos_test_synthetic',GROWTHOS_DB_HOST:'127.0.0.1',GROWTHOS_DB_PORT:'3307',GROWTHOS_DB_USER:'synthetic',GROWTHOS_DB_PASSWORD:'synthetic',GROWTHOS_PRODUCTION_APPROVAL:'YES'},'production approval flag not accepted']
];
for(const [env,message] of negative){
 const r=run(['--test-disposable'],env);
 assert.notEqual(r.status,0);
 assert.ok(r.stderr.includes(message),r.stderr);
}
const unknown=run(['--production']);
assert.notEqual(unknown.status,0);
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'growthos-hash-refusal-'));
try{
 const scriptDir=path.join(temp,'scripts');
 const sqlDir=path.join(temp,'database','mysql');
 fs.mkdirSync(scriptDir,{recursive:true});
 fs.mkdirSync(sqlDir,{recursive:true});
 fs.copyFileSync(runner,path.join(scriptDir,path.basename(runner)));
 for(const m of parsed.migrations)fs.copyFileSync(path.join(__dirname,'..','database','mysql',m.file),path.join(sqlDir,m.file));
 fs.copyFileSync(path.join(__dirname,'..','database','mysql','000_migration_ledger.sql'),path.join(sqlDir,'000_migration_ledger.sql'));
 fs.appendFileSync(path.join(sqlDir,parsed.migrations[0].file),'\n-- changed after review\n');
 const changed=spawnSync(process.execPath,[path.join(scriptDir,path.basename(runner)),'--test-disposable'],{
  encoding:'utf8',timeout:10000,env:{PATH:process.env.PATH,HOME:process.env.HOME,
   GROWTHOS_MIGRATION_TEST_DISPOSABLE:'YES',GROWTHOS_DB_NAME:'growthos_test_synthetic',
   GROWTHOS_DB_HOST:'127.0.0.1',GROWTHOS_DB_PORT:'3307',GROWTHOS_DB_USER:'synthetic',GROWTHOS_DB_PASSWORD:'synthetic'}
 });
 assert.notEqual(changed.status,0);
 assert.ok(changed.stderr.includes('reviewed SHA-256 mismatch in '+parsed.migrations[0].file),changed.stderr);
 assert.ok(!changed.stdout.includes('TEST_APPLIED'),changed.stdout);
}finally{fs.rmSync(temp,{recursive:true,force:true});}
console.log('PASS: plan manifest and '+(negative.length+2)+' offline refusal tests; no database connection');
