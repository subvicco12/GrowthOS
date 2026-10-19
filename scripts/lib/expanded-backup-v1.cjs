'use strict';
// Versioned archive, not a general mariadb-dump interpreter. No production connection factory.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {TextDecoder}=require('node:util');
const pkg=require('./content-certification-package.cjs');
const {assert,sha}=pkg;
const FORMAT='growthos-expanded-backup-v1';
const EXPECTED_CONTRACT_HASH='17ce94be57e677190522341bf011195eba889938a89ec83cce99d8a589e17786';
const MAX_BYTES=32*1024*1024,MAX_ROWS=100000;
const safeSchema=s=>typeof s==='string'&&/^growthos_test_[a-zA-Z0-9_]{1,48}$/.test(s);
const canonical=value=>JSON.stringify(value);
const same=(a,b)=>canonical(a)===canonical(b);
const exact=(o,keys)=>o&&typeof o==='object'&&!Array.isArray(o)&&same(Object.keys(o).sort(),keys.slice().sort());
const clean=s=>s.split('\n').filter(line=>!/^\s*--/.test(line)).join('\n').trim();
function schemaContract(){
 const checked=pkg.verifyPackage();
 const ddl=[clean(fs.readFileSync(path.join(pkg.root,'database/mysql/000_migration_ledger.sql'),'utf8')).replace(/;$/,'')];
 for(const m of checked.migrations){const source=clean(fs.readFileSync(path.join(pkg.root,'database/mysql',m.file),'utf8'));let parts;
  if(m.file.startsWith('008_'))parts=source.split('\n').filter(line=>/^CREATE TRIGGER/.test(line)).map(line=>line.trim().replace(/\/\/$/,''));
  else if(m.file.startsWith('009_'))parts=[source.match(/CREATE TABLE[\s\S]*?ENGINE=InnoDB;/)[0].replace(/;$/,''),...[...source.matchAll(/CREATE TRIGGER[\s\S]*?;/g)].map(m=>m[0].replace(/;$/,''))];
  else parts=source.split(';').map(s=>s.trim()).filter(Boolean);
  ddl.push(...parts.filter(s=>!s.startsWith('INSERT INTO')));
 }
 ddl.push(...checked.statements);
 assert(ddl.length===32&&ddl.every(s=>/^(CREATE TABLE|CREATE TRIGGER|ALTER TABLE growth_ai_reservations ADD UNIQUE KEY)\b/.test(s)&&!s.includes('/*!')&&!s.includes('/*M!')),'pinned DDL inventory changed');
 const tables=ddl.filter(s=>s.startsWith('CREATE TABLE')).map(sql=>({name:sql.match(/^CREATE TABLE (\w+)/)[1],columns:[...sql.matchAll(/[(,]\s*(\w+)\s+(?:CHAR|VARCHAR|BIGINT|INT|TINYINT|DATETIME|TIMESTAMP|DATE|ENUM|LONGTEXT|BOOLEAN)\b/g)].map(m=>m[1])}));
 assert(tables.length===20&&tables.every(t=>t.columns.length>0&&new Set(t.columns).size===t.columns.length),'table contract invalid');
 const triggers=ddl.filter(s=>s.startsWith('CREATE TRIGGER')).map(s=>s.match(/^CREATE TRIGGER (\w+)/)[1]);assert(triggers.length===11,'trigger contract changed');
 const ledger=[...checked.migrations.map(m=>[m.file,m.sha256]),['010_content_persistence_candidate.sql',checked.candidateHash]];
 const model={format:FORMAT,ddl,tables,triggers,ledger};const contractHash=sha(canonical(model));assert(contractHash===EXPECTED_CONTRACT_HASH,'expanded v1 reviewed schema contract changed');return {...model,contractHash};
}
function orderedRows(rows){return rows.slice().sort((a,b)=>Buffer.compare(Buffer.from(canonical(a)),Buffer.from(canonical(b))));}
function rowHash(rows){return sha(canonical(orderedRows(rows)));}
function validateMetadata(metadata,reference,model){
 assert(reference&&same(metadata,reference),'metadata differs from independently installed reference');
 assert(exact(metadata,['tables','columns','indexes','foreignKeys','references','triggers','checks']),'metadata fields invalid');
 assert(same(metadata.tables.map(t=>t.TABLE_NAME).sort(),model.tables.map(t=>t.name).sort())&&metadata.tables.every(t=>t.ENGINE==='InnoDB'&&t.TABLE_COLLATION==='utf8mb4_uca1400_ai_ci'),'table/engine/collation inventory mismatch');
 assert(metadata.foreignKeys.length===40&&metadata.triggers.length===11&&same(metadata.triggers.map(t=>t.TRIGGER_NAME).sort(),model.triggers.slice().sort()),'FK/trigger inventory mismatch');
 for(const table of model.tables)assert(same(metadata.columns.filter(c=>c.TABLE_NAME===table.name).map(c=>c.COLUMN_NAME),table.columns),'column contract mismatch');
}
function seal(document,key){assert(Buffer.isBuffer(key)&&key.length===32,'independent 256-bit archive key required');const payload=canonical(document);const digest=sha(payload);return Buffer.from(canonical({format:FORMAT,payload,sha256:digest,signature:crypto.createHmac('sha256',key).update(FORMAT+'\n'+digest+'\n'+payload).digest('hex')}));}
function scopeRows(tables){
 const byName=new Map(tables.map(t=>[t.name,t])),cache=new Map();const objects=name=>{if(cache.has(name))return cache.get(name);const t=byName.get(name),rows=t.rows.map(row=>Object.fromEntries(t.columns.map((col,i)=>[col,row[i]])));cache.set(name,rows);return rows;};
 const sites=objects('growth_websites'),records=objects('growth_content_records'),claims=objects('growth_publication_claims');
 const siteKey=(o,w)=>canonical([o,w]);const recordKey=(o,w,id)=>canonical([o,w,id]);
 const siteSet=new Set(sites.map(r=>siteKey(r.organization_id,r.id))),recordSet=new Set(records.map(r=>recordKey(r.organization_id,r.website_id,r.id)));
 const recordMap=new Map(records.map(r=>[recordKey(r.organization_id,r.website_id,r.id),r]));
 const reservations=new Set(objects('growth_ai_reservations').map(r=>recordKey(r.organization_id,r.website_id,r.id)));
 const claimKeys=new Set(claims.map(r=>canonical([r.organization_id,r.website_id,r.content_id,r.channel])));
 for(const name of ['growth_content_records','growth_content_events','growth_connector_health','growth_publication_claims','growth_publication_observations'])for(const row of objects(name)){
  assert(siteSet.has(siteKey(row.organization_id,row.website_id)),'row website scope mismatch');
  if(row.content_id!==undefined)assert(recordSet.has(recordKey(row.organization_id,row.website_id,row.content_id)),'row content scope mismatch');
  if(name==='growth_content_records'||name==='growth_content_events'){
   const r=JSON.parse(row.record_json);assert(r.organizationId===row.organization_id&&r.websiteId===row.website_id&&r.id===(row.id||row.content_id)&&String(r.version)===String(row.version),'content JSON scope/version mismatch');
   if(name==='growth_content_records')assert(r.stage===row.stage,'content stage mismatch');
  }
  if(name==='growth_connector_health')assert(['unknown','disconnected','unavailable','verified'].includes(row.status)&&Date.parse(row.expires_at+'Z')>Date.parse(row.checked_at+'Z'),'connector evidence malformed');
  if(name==='growth_publication_claims'){
   assert(reservations.has(recordKey(row.organization_id,row.website_id,row.reservation_id)),'claim reservation scope mismatch');
   const content=recordMap.get(recordKey(row.organization_id,row.website_id,row.content_id));const contentState=JSON.parse(content.record_json);
   assert(row.status==='confirmed'?(['published','attributed'].includes(contentState.stage)&&contentState.publication?.providerId===row.provider_id&&contentState.publication?.url===row.publication_url):contentState.stage==='publication_unknown','claim/content status mismatch');
   assert(['unknown','confirmed','absent'].includes(row.status)&&(row.status==='confirmed'?(typeof row.provider_id==='string'&&row.provider_id.length>0&&/^https:\/\//.test(row.publication_url)):(row.provider_id===null&&row.publication_url===null)),'claim state malformed');
  }
  if(name==='growth_publication_observations'){
   const observation=JSON.parse(row.observation_json).observation;
   assert(observation&&['organizationId','websiteId','contentId','channel','issuer','eventId'].every((k,i)=>observation[k]===row[['organization_id','website_id','content_id','channel','issuer','event_id'][i]]),'observation scope mismatch');
   assert(claimKeys.has(canonical([row.organization_id,row.website_id,row.content_id,row.channel])),'observation claim scope mismatch');
  }
 }
}
function validateArchive(bytes,{key,source,destination,reference}){
 assert(Buffer.isBuffer(bytes)&&bytes.length>0&&bytes.length<=MAX_BYTES,'archive size invalid');
 assert(safeSchema(source)&&safeSchema(destination)&&source!==destination,'independent disposable source/destination required');
 assert(Buffer.isBuffer(key)&&key.length===32,'independent archive verification key required');
 let text;try{text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{throw Error('REFUSED: archive UTF-8 invalid');}
 const outer=JSON.parse(text);assert(exact(outer,['format','payload','sha256','signature'])&&outer.format===FORMAT&&typeof outer.payload==='string'&&/^[a-f0-9]{64}$/.test(outer.signature),'archive envelope malformed');
 assert(canonical(outer)===text&&outer.sha256===sha(outer.payload),'archive noncanonical or corrupted');
 const signature=crypto.createHmac('sha256',key).update(FORMAT+'\n'+outer.sha256+'\n'+outer.payload).digest();assert(crypto.timingSafeEqual(signature,Buffer.from(outer.signature,'hex')),'archive authentication failed');
 const d=JSON.parse(outer.payload),model=schemaContract();
 assert(exact(d,['format','sourceSchema','contractHash','ddl','metadata','tables'])&&d.format===FORMAT&&d.sourceSchema===source&&canonical(d)===outer.payload,'archive identity or fields invalid');
 assert(d.contractHash===model.contractHash&&same(d.ddl,model.ddl),'unapproved DDL/SQL/comments/session statements');
 validateMetadata(d.metadata,reference,model);
 assert(Array.isArray(d.tables)&&d.tables.length===20,'archive table inventory mismatch');
 let total=0;
 for(let i=0;i<model.tables.length;i++){
  const t=d.tables[i],expected=model.tables[i];assert(exact(t,['name','columns','rows','count','sha256'])&&t.name===expected.name&&same(t.columns,expected.columns),'archive table/columns invalid');
  assert(Array.isArray(t.rows)&&t.rows.length<=MAX_ROWS&&t.count===t.rows.length,'archive row count mismatch');total+=t.rows.length;
  assert(t.rows.every(row=>Array.isArray(row)&&row.length===t.columns.length&&row.every(v=>v===null||typeof v==='string'||(typeof v==='number'&&Number.isSafeInteger(v)))),'archive row cell invalid');
  assert(same(t.rows,orderedRows(t.rows))&&t.sha256===rowHash(t.rows),'archive content hash/order mismatch');
 }
 assert(total<=MAX_ROWS,'archive aggregate row cap exceeded');
 const ledger=d.tables.find(t=>t.name==='growth_schema_migrations');const id=ledger.columns.indexOf('migration_id'),hash=ledger.columns.indexOf('sha256');
 assert(same(ledger.rows.map(r=>[r[id],r[hash]]).sort((a,b)=>a[0].localeCompare(b[0])),model.ledger),'ten migration ledger hashes required');
 const byName=new Map(d.tables.map(t=>[t.name,t]));
 for(const table of d.tables){const unique=d.metadata.indexes.filter(i=>i.TABLE_NAME===table.name&&Number(i.NON_UNIQUE)===0);const indexes=new Map();for(const col of unique){const list=indexes.get(col.INDEX_NAME)||[];list.push(col.COLUMN_NAME);indexes.set(col.INDEX_NAME,list);}
  for(const columns of indexes.values()){const seen=new Set();for(const row of table.rows){const tuple=columns.map(c=>row[table.columns.indexOf(c)]);if(tuple.some(v=>v===null))continue;const key=canonical(tuple);assert(!seen.has(key),'duplicate archive unique key');seen.add(key);}}
 }
 const groups=new Map();for(const fk of d.metadata.foreignKeys){const name=fk.TABLE_NAME+':'+fk.CONSTRAINT_NAME;const list=groups.get(name)||[];list.push(fk);groups.set(name,list);}
 for(const fields of groups.values()){const child=byName.get(fields[0].TABLE_NAME),parent=byName.get(fields[0].REFERENCED_TABLE_NAME);assert(child&&parent,'unapproved FK table');
  const values=new Set(parent.rows.map(row=>canonical(fields.map(f=>String(row[parent.columns.indexOf(f.REFERENCED_COLUMN_NAME)])))));
  for(const row of child.rows){const tuple=fields.map(f=>row[child.columns.indexOf(f.COLUMN_NAME)]);if(tuple.some(v=>v===null))continue;assert(values.has(canonical(tuple.map(String))),'archive foreign-key violation');}
 }
 scopeRows(d.tables);return d;
}
async function query(conn,sql,values=[]){const [rows]=await conn.query(sql,values);return rows;}
async function metadata(conn,db){
 assert(safeSchema(db),'disposable schema required');
 const m={};
 const queries={
  tables:'SELECT TABLE_NAME,ENGINE,ROW_FORMAT,TABLE_COLLATION FROM information_schema.TABLES WHERE TABLE_SCHEMA=? ORDER BY TABLE_NAME',
  columns:'SELECT TABLE_NAME,COLUMN_NAME,ORDINAL_POSITION,COLUMN_TYPE,IS_NULLABLE,COLUMN_DEFAULT,EXTRA,CHARACTER_SET_NAME,COLLATION_NAME,GENERATION_EXPRESSION FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=? ORDER BY TABLE_NAME,ORDINAL_POSITION',
  indexes:'SELECT TABLE_NAME,INDEX_NAME,NON_UNIQUE,SEQ_IN_INDEX,COLUMN_NAME,SUB_PART,INDEX_TYPE,COLLATION FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=? ORDER BY TABLE_NAME,INDEX_NAME,SEQ_IN_INDEX',
  foreignKeys:'SELECT TABLE_NAME,CONSTRAINT_NAME,COLUMN_NAME,ORDINAL_POSITION,POSITION_IN_UNIQUE_CONSTRAINT,REFERENCED_TABLE_SCHEMA,REFERENCED_TABLE_NAME,REFERENCED_COLUMN_NAME FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA=? AND REFERENCED_TABLE_NAME IS NOT NULL ORDER BY TABLE_NAME,CONSTRAINT_NAME,ORDINAL_POSITION',
  references:'SELECT TABLE_NAME,CONSTRAINT_NAME,REFERENCED_TABLE_NAME,MATCH_OPTION,UPDATE_RULE,DELETE_RULE FROM information_schema.REFERENTIAL_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=? ORDER BY TABLE_NAME,CONSTRAINT_NAME',
  triggers:'SELECT TRIGGER_NAME,EVENT_MANIPULATION,EVENT_OBJECT_TABLE,ACTION_ORDER,ACTION_STATEMENT,ACTION_TIMING,SQL_MODE,CHARACTER_SET_CLIENT,COLLATION_CONNECTION,DATABASE_COLLATION FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=? ORDER BY TRIGGER_NAME',
  checks:'SELECT TABLE_NAME,CONSTRAINT_NAME,CHECK_CLAUSE FROM information_schema.CHECK_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=? ORDER BY TABLE_NAME,CONSTRAINT_NAME'
 };
 for(const [key,sql] of Object.entries(queries))m[key]=await query(conn,sql,[db]);
 for(const fk of m.foreignKeys){assert(fk.REFERENCED_TABLE_SCHEMA===db,'cross-schema FK forbidden');delete fk.REFERENCED_TABLE_SCHEMA;}
 assert((await query(conn,'SELECT ROUTINE_NAME FROM information_schema.ROUTINES WHERE ROUTINE_SCHEMA=?',[db])).length===0&&(await query(conn,'SELECT EVENT_NAME FROM information_schema.EVENTS WHERE EVENT_SCHEMA=?',[db])).length===0,'routines/events forbidden');return m;
}
async function identity(conn,db){assert(safeSchema(db),'disposable identity required');const [r]=await query(conn,'SELECT DATABASE() AS db,VERSION() AS version,@@foreign_key_checks AS fk,@@autocommit AS autocommit,@@check_constraint_checks AS checks,@@character_set_database AS charset,@@collation_database AS collation,@@innodb_page_size AS page_size');assert(r.db===db&&/^11\.8\.\d+.*MariaDB/i.test(r.version)&&Number(r.fk)===1&&Number(r.autocommit)===1&&Number(r.checks)===1&&r.charset==='utf8mb4'&&r.collation==='utf8mb4_uca1400_ai_ci'&&Number(r.page_size)===16384,'database identity/session mismatch');}
async function snapshot(conn,source,reference,key){
 await identity(conn,source);const model=schemaContract(),before=await metadata(conn,source);validateMetadata(before,reference,model);
 const tables=[];await conn.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');await conn.query('START TRANSACTION WITH CONSISTENT SNAPSHOT');
 try{for(const table of model.tables){const records=await query(conn,'SELECT '+table.columns.map(c=>'`'+c+'`').join(',')+' FROM `'+table.name+'` LIMIT '+(MAX_ROWS+1));assert(records.length<=MAX_ROWS,'snapshot row limit exceeded');const rows=orderedRows(records.map(r=>table.columns.map(c=>r[c])));tables.push({...table,rows,count:rows.length,sha256:rowHash(rows)});}await conn.commit();}catch(e){await conn.rollback();throw e;}
 assert(same(before,await metadata(conn,source)),'source schema changed during snapshot');const doc={format:FORMAT,sourceSchema:source,contractHash:model.contractHash,ddl:model.ddl,metadata:before,tables};const bytes=seal(doc,key);validateArchive(bytes,{key,source,destination:source==='growthos_test_validation'?'growthos_test_validation_alt':'growthos_test_validation',reference});return bytes;
}
async function empty(conn,destination){await identity(conn,destination);for(const [catalog,col] of [['TABLES','TABLE_SCHEMA'],['TRIGGERS','TRIGGER_SCHEMA'],['ROUTINES','ROUTINE_SCHEMA'],['EVENTS','EVENT_SCHEMA']])assert((await query(conn,'SELECT COUNT(*) AS n FROM information_schema.'+catalog+' WHERE '+col+'=?',[destination]))[0].n==0,'restore destination nonempty or partial; no retry');}
async function restore(conn,bytes,{key,source,destination,reference}){
 const archive=validateArchive(bytes,{key,source,destination,reference});await identity(conn,destination);
 const [lock]=await query(conn,'SELECT GET_LOCK(?,0) AS held',['gx1:'+destination]);assert(Number(lock.held)===1,'restore lock unavailable');
 try{await empty(conn,destination);for(const ddl of schemaContract().ddl)await conn.query(ddl); // DDL implicit commits: partial result never retried.
  await conn.beginTransaction();try{
   for(const table of archive.tables)for(const saved of table.rows){const values=saved.slice();let terminal;
    if(table.name==='growth_publication_claims'){const i=table.columns.indexOf('status'),p=table.columns.indexOf('provider_id'),u=table.columns.indexOf('publication_url');if(values[i]!=='unknown'){terminal={status:values[i],provider:values[p],url:values[u]};values[i]='unknown';values[p]=null;values[u]=null;}}
    await conn.execute('INSERT INTO `'+table.name+'` ('+table.columns.map(c=>'`'+c+'`').join(',')+') VALUES ('+values.map(()=>'?').join(',')+')',values);
    if(terminal){const [changed]=await conn.execute('UPDATE growth_publication_claims SET status=?,provider_id=?,publication_url=? WHERE organization_id=? AND website_id=? AND content_id=? AND channel=? AND status=?',[terminal.status,terminal.provider,terminal.url,...['organization_id','website_id','content_id','channel'].map(c=>saved[table.columns.indexOf(c)]),'unknown']);assert(changed.affectedRows===1,'terminal claim restore transition failed');}
   }await conn.commit();
  }catch(e){await conn.rollback();throw e;}
  assert(same(await metadata(conn,destination),reference),'restored schema metadata mismatch');
  const restored=JSON.parse(JSON.parse((await snapshot(conn,destination,reference,key)).toString()).payload);
  assert(same(restored.tables,archive.tables),'restored counts/content hashes differ');await identity(conn,destination);
  return {format:FORMAT,status:'RESTORE_VERIFIED',tables:20,triggers:11,foreignKeyColumns:40,ledgerEntries:10,counts:archive.tables.map(t=>({table:t.name,count:t.count,sha256:t.sha256}))};
 }finally{await conn.query('SELECT RELEASE_LOCK(?)',['gx1:'+destination]);}
}
module.exports={FORMAT,MAX_BYTES,schemaContract,orderedRows,rowHash,seal,validateArchive,metadata,identity,snapshot,restore};
