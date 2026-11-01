import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import type {PoolConnection,RowDataPacket} from 'mysql2/promise';
const proposals=['database/proposals/session02-isolated-workflows/017_session02_disposable_candidate.sql','database/proposals/session03-isolated-runtime/018_session03_disposable_candidate.sql','database/proposals/session04-compatibility/019_session04_disposable_candidate.sql'];
export function developmentSchemaManifest(){return proposals.map(file=>{const bytes=readFileSync(file);return {file,hash:createHash('sha256').update(bytes).digest('hex'),tables:[...bytes.toString().matchAll(/CREATE TABLE\s+(\w+)/g)].map(m=>m[1])};});}
export async function assertCompatibleDevelopmentSchema(c:PoolConnection){
 const manifest=developmentSchemaManifest(),required=manifest.flatMap(x=>x.tables);
 const [tables]=await c.query<RowDataPacket[]>('SELECT TABLE_NAME,ENGINE,TABLE_COLLATION FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE()');const tableMap=new Map(tables.map(r=>[r.TABLE_NAME,r]));
 if(required.some(name=>!tableMap.has(name)))throw Error('SCHEMA_PARTIAL_OR_MISSING');
 const collation=tableMap.get('growth_websites')?.TABLE_COLLATION;
 if(!collation||required.some(name=>tableMap.get(name)!.ENGINE!=='InnoDB'||tableMap.get(name)!.TABLE_COLLATION!==collation))throw Error('SCHEMA_ENGINE_COLLATION_MISMATCH');
 for(const [table,version]of [['growth_dev_contract','session02-v1'],['growth_dev_s03_contract','session03-v1'],['growth_dev_s04_contract','session04-v1']]){
  const [rows]=await c.query<RowDataPacket[]>(`SELECT contract_version FROM ${table} WHERE id=1`);if(rows[0]?.contract_version!==version)throw Error('SCHEMA_VERSION_INCOMPATIBLE');}
 const [indexes]=await c.query<RowDataPacket[]>('SELECT DISTINCT TABLE_NAME,INDEX_NAME FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE()');
 for(const [table,index]of [['growth_dev_analysis_jobs','uq_dev_job_request'],['growth_dev_bridge_batches','uq_bridge_request'],['growth_dev_worker_leases','PRIMARY']])if(!indexes.some(r=>r.TABLE_NAME===table&&r.INDEX_NAME===index))throw Error('SCHEMA_INDEX_MISSING');
 const [ledger]=await c.query<RowDataPacket[]>('SELECT migration_id,sha256 FROM growth_schema_migrations ORDER BY migration_id');if(ledger.length!==9)throw Error('BASELINE_LEDGER_INCOMPATIBLE');
 for(let i=0;i<9;i++)if(!String(ledger[i].migration_id).startsWith(String(i+1).padStart(3,'0')+'_')||ledger[i].sha256!==createHash('sha256').update(readFileSync('database/mysql/'+ledger[i].migration_id)).digest('hex'))throw Error('BASELINE_LEDGER_INCOMPATIBLE');
 const [columns]=await c.query<RowDataPacket[]>('SELECT TABLE_NAME,COLUMN_NAME,COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE()');
 for(const [table,names]of Object.entries({growth_dev_worker_leases:['fence','token_hash','expires_at','owner_id'],growth_dev_bridge_items:['payload_json','batch_id'],growth_dev_wordpress_fixtures:['encrypted_key','authority_epoch','credential_revision'],growth_dev_fleet_policy:['emergency_stopped','ai_limit_minor','external_enabled']}))for(const name of names)if(!columns.some(r=>r.TABLE_NAME===table&&r.COLUMN_NAME===name))throw Error('SCHEMA_COLUMN_MISSING');
 const [triggers]=await c.query<RowDataPacket[]>('SELECT TRIGGER_NAME FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE()');
 for(const file of proposals)for(const match of readFileSync(file,'utf8').matchAll(/CREATE TRIGGER\s+(\w+)/g))if(!triggers.some(r=>r.TRIGGER_NAME===match[1]))throw Error('SCHEMA_AUDIT_TRIGGER_MISSING');
 const [fks]=await c.query<RowDataPacket[]>('SELECT TABLE_NAME,COLUMN_NAME,REFERENCED_TABLE_NAME FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA=DATABASE() AND REFERENCED_TABLE_NAME IS NOT NULL');
 if(!fks.some(r=>r.TABLE_NAME==='growth_dev_worker_leases'&&r.COLUMN_NAME==='job_id'&&r.REFERENCED_TABLE_NAME==='growth_dev_analysis_jobs')||!fks.some(r=>r.TABLE_NAME==='growth_dev_bridge_items'&&r.COLUMN_NAME==='batch_id'&&r.REFERENCED_TABLE_NAME==='growth_dev_bridge_batches'))throw Error('SCHEMA_SCOPE_FOREIGN_KEY_MISSING');
 return {version:'DevelopmentCompatibility/v1',canonicalAuthority:'unavailable',productionReady:false,collation,tables:required.length,manifest};
}
