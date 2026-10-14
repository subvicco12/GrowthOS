#!/usr/bin/env node
'use strict';
// Separate GrowthOS migration executor candidate. PRODUCTION EXECUTION DISABLED.
// Test-only execution requires a disposable MariaDB server and synthetic credentials.
// This file does not modify the existing mariadb-migration-runner.cjs.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),dir=path.join(root,'database/mysql');
// Independently reviewed migration bytes. Keep these pins separate from the
// manifest generator so a changed SQL file cannot silently become trusted.
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
const names=fs.readdirSync(dir).filter(n=>/^00[1-9]_.*\.sql$/.test(n)).sort();
function requireSafe(ok,msg){if(!ok)throw Error('REFUSED: '+msg);}
requireSafe(names.length===9&&names.every((n,i)=>n.startsWith(String(i+1).padStart(3,'0')+'_')),'expected exactly migrations 001..009');
const migrations=names.map((file,i)=>{const sql=fs.readFileSync(path.join(dir,file),'utf8');const hash=crypto.createHash('sha256').update(sql).digest('hex');requireSafe(hash===reviewedHashes[i],'reviewed SHA-256 mismatch in '+file);return {file,sql,hash};});
const ledger=fs.readFileSync(path.join(dir,'000_migration_ledger.sql'),'utf8').trim();
function statements(m){
 const clean=m.sql.split('\n').filter(line=>!/^\s*--/.test(line)).join('\n');
 requireSafe(!/\b(?:DROP|TRUNCATE|ALTER|REPLACE|GRANT|REVOKE)\b/i.test(clean),'prohibited statement in '+m.file);
 let parts;
 if(m.file.startsWith('008_'))parts=clean.split('\n').filter(l=>/^CREATE TRIGGER\b/i.test(l.trim())).map(l=>l.trim().replace(/\/\/$/,''));
 else if(m.file.startsWith('009_'))parts=[clean.match(/CREATE TABLE[\s\S]*?ENGINE=InnoDB;/i)?.[0],...[...clean.matchAll(/CREATE TRIGGER[\s\S]*?;/gi)].map(m=>m[0])];
 else parts=clean.split(';').map(s=>s.trim()).filter(Boolean);
 const counts=[7,1,1,1,2,1,1,2,3];
 const index=Number(m.file.slice(0,3))-1;
 requireSafe(parts.length===counts[index]&&parts.every(p=>typeof p==='string'&&/^(CREATE TABLE|CREATE TRIGGER|INSERT INTO)\b/i.test(p)), 'unrecognized SQL in '+m.file);
 return parts;
}
const planned=migrations.map(m=>({...m,statements:statements(m)}));
const mode=process.argv[2];
requireSafe(['--plan','--test-disposable'].includes(mode)&&process.argv.length===3,'only --plan or --test-disposable supported');
if(mode==='--plan'){
 console.log(JSON.stringify({status:'PLAN_ONLY',productionExecutionEnabled:false,migrations:planned.map(m=>({file:m.file,sha256:m.hash,statementCount:m.statements.length}))},null,2));
 process.exit(0);
}
const db=process.env.GROWTHOS_DB_NAME||'';
const host=process.env.GROWTHOS_DB_HOST||'';
const port=Number(process.env.GROWTHOS_DB_PORT||0);
requireSafe(process.env.GROWTHOS_MIGRATION_TEST_DISPOSABLE==='YES','disposable confirmation missing');
requireSafe(/^growthos_test_[A-Za-z0-9_]+$/.test(db),'database must be growthos_test_*');
requireSafe(['127.0.0.1','::1','localhost'].includes(host),'local loopback host required');
requireSafe(Number.isInteger(port)&&port>0&&port<=65535,'explicit valid local port required');
requireSafe(process.env.GROWTHOS_DB_USER&&process.env.GROWTHOS_DB_PASSWORD,'synthetic credentials required');
requireSafe(!process.env.GROWTHOS_PRODUCTION_APPROVAL,'production approval flag not accepted by this candidate');
(async()=>{
 const mysql=require('mysql2/promise');
 const conn=await mysql.createConnection({host,port,user:process.env.GROWTHOS_DB_USER,password:process.env.GROWTHOS_DB_PASSWORD,database:db,multipleStatements:false,connectTimeout:5000});
 try{
  const [[identity]]=await conn.query('SELECT DATABASE() AS db, VERSION() AS version, @@hostname AS server_host');
  requireSafe(identity.db===db&&/11\.8\.[0-9]+.*MariaDB/i.test(identity.version),'unexpected schema or MariaDB version');
  const [tables]=await conn.execute('SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA=?',[db]);
  const [triggers]=await conn.execute('SELECT TRIGGER_NAME FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=?',[db]);
  requireSafe(tables.length===0&&triggers.length===0,'schema not empty or partial installation detected');
  // DDL is not transactionally reversible. Never retry automatically after any failure.
  await conn.query(ledger);
  for(const m of planned){
   for(const statement of m.statements)await conn.query(statement);
   await conn.execute('INSERT INTO growth_schema_migrations(migration_id,sha256,engine_version) VALUES (?,?,?)',[m.file,m.hash,identity.version]);
   console.log('TEST_APPLIED',m.file);
  }
  const [entries]=await conn.query('SELECT migration_id,sha256 FROM growth_schema_migrations ORDER BY migration_id');
  requireSafe(entries.length===9&&entries.every((r,i)=>r.migration_id===planned[i].file&&r.sha256===planned[i].hash),'ledger mismatch');
  const [allTables]=await conn.execute('SELECT TABLE_NAME,ENGINE FROM information_schema.TABLES WHERE TABLE_SCHEMA=?',[db]);
  const [allTriggers]=await conn.execute('SELECT TRIGGER_NAME FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=?',[db]);
  const [fks]=await conn.execute('SELECT COLUMN_NAME FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA=? AND REFERENCED_TABLE_NAME IS NOT NULL',[db]);
  requireSafe(allTables.length===15&&allTables.every(t=>t.ENGINE==='InnoDB'),'table inventory mismatch');
  requireSafe(allTriggers.length===4,'audit trigger count mismatch');
  requireSafe(fks.length===23,'foreign-key column count mismatch');
  console.log('PASS: disposable-only installation; 9 hashes; 15 InnoDB tables; 4 triggers; 23 FK columns');
 }finally{await conn.end();}
})().catch(e=>{console.error('STOP: no automatic retry or cleanup. '+e.message);process.exitCode=1;});
