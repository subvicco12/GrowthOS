#!/usr/bin/env node
'use strict';
// GrowthOS disposable-only logical backup/restore rehearsal candidate.
// NO production path. This script never creates, drops, or cleans up schemas.
// Requires two pre-created dedicated disposable schemas and synthetic credentials.
// Run --plan without database access. Live --rehearse requires explicit opt-in.
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const crypto=require('node:crypto');
const {spawnSync}=require('node:child_process');
const mysql=require('mysql2/promise');
const {validateDump}=require('./disposable-dump-guard.cjs');
function refuse(message){throw Error('REFUSED: '+message);}
function assert(condition,message){if(!condition)refuse(message);}
const mode=process.argv[2];
assert(process.argv.length===3&&['--plan','--rehearse'].includes(mode),'only --plan or --rehearse supported');
const source=process.env.GROWTHOS_BACKUP_SOURCE||'';
const dest=process.env.GROWTHOS_BACKUP_DEST||'';
const host=process.env.GROWTHOS_DB_HOST||'';
const port=Number(process.env.GROWTHOS_DB_PORT||0);
const user=process.env.GROWTHOS_DB_USER||'';
const password=process.env.GROWTHOS_DB_PASSWORD||'';
const safeName=n=>/^growthos_test_[A-Za-z0-9_]+$/.test(n);
const fileNames=fs.readdirSync(path.resolve(__dirname,'../database/mysql')).filter(n=>/^00[1-9]_.*\.sql$/.test(n)).sort();
const reviewedHashes=[
'b67ab03511cd972ee07f7e891d35134e84c0e0ac00ff8f27614f5fcf479108c6',
'2b5d77e9120b23debd57f39439ceee3fafee7b46c1c5c26c22c1597aebddab2e',
'c2bcabc28b3c26827ea0e1f5e01b6e6c0ce0c7d9797f6c5ed9c4c60150b0b4c7',
'4bf0afc1e375720abaadf5b3bc282ed0b7d5c83cd56e58f37b3b557133f1c179',
'4c020458375497ba0808a65ac76baaa839c13697de054608f5c42556ad14919b',
'763ee4dd6b9461a799bffc1f314bc0ff69bc6dd84a52f9e96841342051f01019',
'8f4fd143f23761e62f381cfcb736efe9380159bb786be07f46e9cee3d28add6f',
'7ad741a87d29157ed1236aacd9daef1f855b5c38f2351bb5e5cf9e305502c672',
'b8d26a4f7f9ce93407d3a3a5c63415bf3ca32a1843275ef5a3b99ba8ff15285c'
];
assert(fileNames.length===9,'migration inventory changed');
fileNames.forEach((name,i)=>assert(crypto.createHash('sha256').update(fs.readFileSync(path.resolve(__dirname,'../database/mysql',name))).digest('hex')===reviewedHashes[i],'migration bytes changed: '+name));
if(mode==='--plan'){console.log('PLAN_ONLY: disposable source and empty destination; dump with triggers; restore; verify schema, ledger and row counts. Production disabled.');process.exit(0);}
assert(process.env.GROWTHOS_BACKUP_TEST_DISPOSABLE==='YES','disposable confirmation missing');
assert(safeName(source)&&safeName(dest)&&source!==dest,'distinct growthos_test_* source and destination required');
assert(host==='127.0.0.1'||host==='::1','numeric loopback host required');
assert(Number.isInteger(port)&&port>0&&port<=65535,'explicit port required');
assert(user&&password,'synthetic credentials required');
assert(!process.env.GROWTHOS_PRODUCTION_APPROVAL,'production approval flag forbidden');
const dbOptions={host,port,user,password,multipleStatements:false,connectTimeout:5000};
async function inventory(conn,db){
 const [[identity]]=await conn.query('SELECT DATABASE() AS db, VERSION() AS version');
 assert(identity.db===db&&/11\.8\.\d+.*MariaDB/i.test(identity.version),'database identity/version mismatch');
 const [tables]=await conn.execute('SELECT TABLE_NAME,ENGINE FROM information_schema.TABLES WHERE TABLE_SCHEMA=? ORDER BY TABLE_NAME',[db]);
 const [triggers]=await conn.execute('SELECT TRIGGER_NAME FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=? ORDER BY TRIGGER_NAME',[db]);
 const [fks]=await conn.execute('SELECT TABLE_NAME,COLUMN_NAME,REFERENCED_TABLE_NAME FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA=? AND REFERENCED_TABLE_NAME IS NOT NULL ORDER BY TABLE_NAME,COLUMN_NAME',[db]);
 return {tables,triggers,fks};
}
async function verify(conn,db){
 const inv=await inventory(conn,db);
 assert(inv.tables.length===15&&inv.tables.every(x=>x.ENGINE==='InnoDB'),'15 InnoDB tables required');
 assert(inv.triggers.length===4,'four triggers required');
 assert(inv.fks.length===23,'23 foreign-key columns required');
 const [ledger]=await conn.query('SELECT migration_id,sha256 FROM growth_schema_migrations ORDER BY migration_id');
 assert(ledger.length===9&&ledger.every((r,i)=>r.migration_id===fileNames[i]&&r.sha256===reviewedHashes[i]),'migration ledger mismatch');
 const counts={},digests={};
 for(const row of inv.tables){
  const [records]=await conn.query('SELECT * FROM `'+row.TABLE_NAME+'`');
  counts[row.TABLE_NAME]=records.length;
  const canonical=records.map(row=>JSON.stringify(row,(_,v)=>typeof v==='bigint'?v.toString():v)).sort().join('\n');
  digests[row.TABLE_NAME]=crypto.createHash('sha256').update(canonical).digest('hex');
 }
 return {inv,counts,digests};
}
function command(bin,args,options){
 const r=spawnSync(bin,args,{...options,timeout:120000,maxBuffer:32*1024*1024});
 assert(!r.error&&r.status===0,bin+' failed (exit '+String(r.status)+')');
 return r;
}
(async()=>{
 let sourceConn,destConn,temp;
 try{
  sourceConn=await mysql.createConnection({...dbOptions,database:source});
  destConn=await mysql.createConnection({...dbOptions,database:dest});
  const before=await verify(sourceConn,source);
  assert(Object.entries(before.counts).some(([table,n])=>table!=='growth_schema_migrations'&&n>0),'source lacks synthetic fixture rows');
  const empty=await inventory(destConn,dest);
  assert(empty.tables.length===0&&empty.triggers.length===0,'restore destination must be empty');
  temp=fs.mkdtempSync(path.join(os.tmpdir(),'growthos-disposable-restore-'));
  fs.chmodSync(temp,0o700);
  const dumpPath=path.join(temp,'synthetic.sql');
  const env={...process.env,MYSQL_PWD:password};
  const common=['--no-defaults','--protocol=TCP','--host='+host,'--port='+port,'--user='+user];
  const start=process.hrtime.bigint();
  const dump=command('mariadb-dump',[...common,'--single-transaction','--triggers','--skip-comments','--skip-add-drop-table','--skip-add-locks','--skip-lock-tables','--no-create-db',source],{env,encoding:null});
  fs.writeFileSync(dumpPath,dump.stdout,{mode:0o600,flag:'wx'});
  assert(fs.statSync(dumpPath).size>0,'empty dump');
  validateDump(dump.stdout,source,dest);
  const saved=fs.readFileSync(dumpPath);
  assert(crypto.createHash('sha256').update(saved).digest('hex')===crypto.createHash('sha256').update(dump.stdout).digest('hex'),'backup changed before restore');
  const backupMs=Number(process.hrtime.bigint()-start)/1e6;
  // Restore only to the independently verified empty disposable destination.
  const restoreStart=process.hrtime.bigint();
  command('mariadb',[...common,dest],{env,input:saved,encoding:null});
  const restoreMs=Number(process.hrtime.bigint()-restoreStart)/1e6;
  const after=await verify(destConn,dest);
  assert(JSON.stringify(before.inv)===JSON.stringify(after.inv),'schema inventory differs');
  assert(JSON.stringify(before.counts)===JSON.stringify(after.counts),'row counts differ');
  assert(JSON.stringify(before.digests)===JSON.stringify(after.digests),'row content digests differ');
  console.log(JSON.stringify({status:'PASS',backupMs,restoreMs,dumpSha256:crypto.createHash('sha256').update(fs.readFileSync(dumpPath)).digest('hex'),tableCount:15,triggerCount:4,fkColumns:23,ledgerCount:9,rowCounts:after.counts}));
 }finally{
  if(sourceConn)await sourceConn.end();
  if(destConn)await destConn.end();
  if(temp)fs.rmSync(temp,{recursive:true,force:true});
 }
})().catch(e=>{console.error('STOP: no automatic retry or schema cleanup. '+e.message);process.exitCode=1;});
