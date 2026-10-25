#!/usr/bin/env node
'use strict';
/** Separate review-only disposable installer. No production runner imports. */
const fs=require('node:fs');const path=require('node:path');
const {verify}=require('./verify-review-migration-chain-offline.cjs');
const {expected}=require('./verify-review-recovery-manifest-offline.cjs');
const {assertDisposable}=require('./review-candidate-disposable-preflight.cjs');
function statements(sql){
 let delimiter=';',pending='',quote='',list=[];
 for(const line of sql.split('\n')){
  if(/^\s*--/.test(line))continue;
  const d=line.trim().match(/^DELIMITER\s+(\/\/|;)$/i);
  if(d){if(pending.trim())throw Error('DELIMITER_WITH_PENDING_SQL');delimiter=d[1];continue;}
  if(/^DELIMITER\b/i.test(line))throw Error('UNSUPPORTED_DELIMITER');
  pending+=line+'\n';let start=0;
  for(let i=0;i<pending.length;i++){
   const c=pending[i];
   if(quote){if(c==='\\'){i++;continue;}if(c===quote){if(pending[i+1]===quote)i++;else quote='';}continue;}
   if(c==="'"||c==='"'||c==='`'){quote=c;continue;}
   if(pending.startsWith(delimiter,i)){
    const statement=pending.slice(start,i).trim();if(statement)list.push(statement);
    i+=delimiter.length-1;start=i+1;
   }
  }
  pending=pending.slice(start);
 }
 if(quote||pending.trim())throw Error('INCOMPLETE_CANDIDATE_SQL');
 return list;
}
function plan(){
 const chain=verify();const result=[];
 for(const candidate of chain.candidateFilesVerified){
  const sql=fs.readFileSync(path.resolve(__dirname,'..',candidate.file),'utf8');
  const parsed=statements(sql);
  const alters={'010':1,'013':4,'014':3};
  const allowed=candidate.tables.length+candidate.triggers.length+(alters[candidate.number]||0);
  if(parsed.length!==allowed||parsed.some(s=>!(/^(?:CREATE TABLE|CREATE TRIGGER)\b/i.test(s)||
     alters[candidate.number]&&/^ALTER TABLE\b/i.test(s)))||
     candidate.number==='014'&&parsed.some(s=>!/^ALTER TABLE\b/i.test(s)))
   throw Error('UNCERTAIN_CANDIDATE_SQL_PARSER_'+candidate.number);
  result.push({...candidate,statements:parsed});
 }
 return result;
}
async function install(env){
 if(env.GROWTHOS_CANDIDATE_INSTALL!=='EXPLICIT_DISPOSABLE_INSTALL_ONLY')throw Error('INSTALL_AUTHORIZATION_REQUIRED');
 const options=assertDisposable(env),files=plan(),inventory=expected();
 const mysql=require('mysql2/promise');
 const config={...options,multipleStatements:false,connectTimeout:3000,timezone:'Z'};
 const a=await mysql.createConnection(config);let b,started=false;
 try{
  b=await mysql.createConnection(config);
  const [[identity]]=await a.query('SELECT DATABASE() AS db,VERSION() AS version,@@bind_address AS bind_address,CONNECTION_ID() AS connection_id');
  const [[other]]=await b.query('SELECT CONNECTION_ID() AS connection_id,DATABASE() AS db');
  if(identity.db!==options.database||other.db!==options.database||identity.connection_id===other.connection_id||
    !/^11\.8\.\d+.*MariaDB/i.test(identity.version)||identity.bind_address!=='127.0.0.1')throw Error('SERVER_IDENTITY_OR_SESSIONS_INVALID');
  const [tables]=await a.execute('SELECT TABLE_NAME,ENGINE FROM information_schema.TABLES WHERE TABLE_SCHEMA=?',[options.database]);
  const [triggers]=await a.execute('SELECT TRIGGER_NAME FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=?',[options.database]);
  const candidateTables=new Set(files.flatMap(f=>f.tables));const candidateTriggers=new Set(files.flatMap(f=>f.triggers));
  const baselineTables=inventory.tables.filter(t=>!candidateTables.has(t));
  const baselineTriggers=inventory.triggers.filter(t=>!candidateTriggers.has(t));
  if(baselineTables.length!==15||baselineTriggers.length!==4||
    JSON.stringify(tables.map(t=>t.TABLE_NAME).sort())!==JSON.stringify(baselineTables)||
    tables.some(t=>t.ENGINE!=='InnoDB')||
    JSON.stringify(triggers.map(t=>t.TRIGGER_NAME).sort())!==JSON.stringify(baselineTriggers))
    throw Error('NOT_EXACT_FRESH_BASELINE_SCHEMA');
  const [ledger]=await a.query('SELECT migration_id,sha256 FROM growth_schema_migrations ORDER BY migration_id');
  const base=Object.entries(inventory.ledger).slice(0,9);
  if(ledger.length!==9||base.some(([id,hash],i)=>ledger[i].migration_id!==id||ledger[i].sha256!==hash))
    throw Error('BASELINE_LEDGER_MISMATCH');
  // DDL commits implicitly. A failure cannot be rolled back or resumed.
  for(const file of files){
   started=true;
   for(const sql of file.statements)await a.query(sql);
   const ledgerName=file.number+'_'+path.basename(file.file).slice(4);
   await a.execute('INSERT INTO growth_schema_migrations (migration_id,sha256,engine_version) VALUES (?,?,?)',
    [ledgerName,file.sha256,identity.version]);
  }
  const [afterTables]=await a.execute('SELECT TABLE_NAME,ENGINE FROM information_schema.TABLES WHERE TABLE_SCHEMA=?',[options.database]);
  const [afterTriggers]=await a.execute('SELECT TRIGGER_NAME FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=?',[options.database]);
  const [fk]=await a.execute('SELECT COLUMN_NAME FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA=? AND REFERENCED_TABLE_NAME IS NOT NULL',[options.database]);
  const [afterLedger]=await a.query('SELECT migration_id,sha256 FROM growth_schema_migrations ORDER BY migration_id');
  if(JSON.stringify(afterTables.map(t=>t.TABLE_NAME).sort())!==JSON.stringify(inventory.tables)||
    afterTables.some(t=>t.ENGINE!=='InnoDB')||
    JSON.stringify(afterTriggers.map(t=>t.TRIGGER_NAME).sort())!==JSON.stringify(inventory.triggers)||
    fk.length!==200||afterLedger.length!==16||Object.entries(inventory.ledger).some(([id,hash],i)=>
      afterLedger[i].migration_id!==id||afterLedger[i].sha256!==hash))throw Error('POST_INSTALL_INVENTORY_MISMATCH');
  return {status:'DISPOSABLE_INSTALL_INVENTORY_ONLY',tables:44,triggers:60,foreignKeyColumns:200,ledgerEntries:16};
 }catch(error){if(started)throw Error('QUARANTINE_PARTIAL_DISPOSABLE_SCHEMA_NEVER_RETRY: '+error.message);throw error;}
 finally{await Promise.allSettled([a.end(),b?.end()]);}
}
module.exports={statements,plan,install};
if(require.main===module){
 (async()=>{
  if(process.argv.length!==3||!['--plan','--install-disposable'].includes(process.argv[2]))throw Error('UNSUPPORTED_MODE');
  if(process.argv[2]==='--plan')console.log(JSON.stringify(plan().map(({number,statements})=>({number,count:statements.length}))));
  else console.log(JSON.stringify(await install(process.env)));
 })().catch(error=>{console.error('REFUSED: '+error.message);process.exitCode=2;});
}
