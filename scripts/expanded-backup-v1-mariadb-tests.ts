/** Real MariaDB tests only. This worker re-verifies owned Docker isolation before connecting. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { randomBytes, createHmac } from 'node:crypto';
import mysql, { type Pool, type RowDataPacket, type Connection } from 'mysql2/promise';
import { publicationEvidencePayload, publicationClaimHash, type PublicationObservation } from '../src/server/publication-evidence';
import type { PublicationClaim } from '../src/core/publication-handoff';
const contract = require('./lib/content-certification-package.cjs');
type Row = RowDataPacket & Record<string, unknown>;
interface Config { host:string;port:number;password:string;db:string;containerHostname:string;synthetic:boolean;containerId:string;name:string;networkName:string;nonce:string;imageRef:string;configDir:string }
const uuid = (n:number) => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const expanded=require('./lib/expanded-backup-v1.cjs');
let passed=0;
async function check(name:string,fn:()=>Promise<void>){await fn();passed++;console.log('PASS REAL_MARIADB '+name);}
function docker(config:Config,args:string[]){const r=spawnSync('docker',['--host','unix:///var/run/docker.sock','--config',config.configDir,...args],{encoding:'utf8',timeout:10000,maxBuffer:1048576,env:{NODE_ENV:'test',PATH:process.env.PATH}});assert.equal(r.status,0,'local Docker metadata unavailable');return JSON.parse(r.stdout)[0];}
function readConfig():Config {
 assert.match(process.versions.node,/^22\./,'Node 22 required');
 assert.equal(process.env.GROWTHOS_CERT_WORKER,'OWNED_DISPOSABLE_STDIN');
 const bytes=fs.readFileSync(0);assert.ok(bytes.length<=16384);const c=JSON.parse(bytes.toString()) as Config;
 assert.equal(c.synthetic,true);assert.equal(c.host,'127.0.0.1');assert.match(c.password,/^[a-f0-9]{64}$/);assert.match(c.nonce,/^[a-f0-9]{24}$/);
 assert.equal(c.db,'growthos_test_cert_'+c.nonce);assert.equal(c.name,'growthos-cert-'+c.nonce);assert.equal(c.networkName,c.name+'-net');
 assert.match(c.imageRef,/^mariadb@sha256:[a-f0-9]{64}$/);
 const container=docker(c,['container','inspect',c.containerId]);
 const port=contract.verifyContainer(container,docker(c,['network','inspect',c.networkName]),docker(c,['image','inspect',c.imageRef]),c);
 assert.equal(port,c.port);assert.equal(container.Config.Hostname,c.containerHostname);
 assert.ok(container.Config.Env.includes('MARIADB_ROOT_PASSWORD='+c.password));return c;
}
async function rows(conn:Pool|Connection,sql:string,params:unknown[]=[]):Promise<Row[]> {const [result]=await conn.query<Row[]>(sql,params);return result;}
async function denied(action:()=>Promise<unknown>,codes?:number[]){await assert.rejects(action,(e:unknown)=>Boolean(e && typeof e==='object' && 'errno' in e && (!codes || codes.includes(Number(e.errno)))));}
async function main(){
 const c=readConfig(),model=expanded.schemaContract(),pkg=contract.verifyPackage();
 const options={host:c.host,port:c.port,user:'root',password:c.password,timezone:'Z',dateStrings:true,supportBigNumbers:true,bigNumberStrings:true,multipleStatements:false,connectTimeout:2000};
 let server:Connection|undefined;for(let i=0;i<60;i++){try{server=await mysql.createConnection(options);break;}catch{await new Promise(r=>setTimeout(r,500));}}
 assert.ok(server,'owned server unavailable');const admin=server;const all:Connection[]=[];const key=randomBytes(32);let artifact:string|undefined;
 try{
  const [identity]=await rows(admin,'SELECT VERSION() AS version,@@hostname AS hostname');assert.match(String(identity.version),/^11\.8\.\d+.*MariaDB/i);assert.equal(identity.hostname,c.containerHostname);
  async function database(suffix:string){const name=c.db+'_'+suffix;assert.match(name,/^growthos_test_cert_[a-f0-9]+_[a-z]+$/);await admin.query('CREATE DATABASE `'+name+'` CHARACTER SET utf8mb4 COLLATE utf8mb4_uca1400_ai_ci');const conn=await mysql.createConnection({...options,database:name});all.push(conn);return {name,conn};}
  const source=await database('source'),reference=await database('reference'),destination=await database('destination');
  // Reuse the unmodified certified baseline installer, then the pinned candidate in this owned schema only.
  const install=spawnSync(process.execPath,[path.join(contract.root,'scripts/production-migration-executor-candidate.cjs'),'--test-disposable'],{encoding:'utf8',timeout:30000,env:{NODE_ENV:'test',PATH:process.env.PATH,GROWTHOS_DB_HOST:c.host,GROWTHOS_DB_PORT:String(c.port),GROWTHOS_DB_NAME:source.name,GROWTHOS_DB_USER:'root',GROWTHOS_DB_PASSWORD:c.password,GROWTHOS_MIGRATION_TEST_DISPOSABLE:'YES'}});assert.equal(install.status,0,'baseline installer refused');
  await expanded.identity(source.conn,source.name);for(const statement of pkg.statements)await source.conn.query(statement);await source.conn.execute('INSERT INTO growth_schema_migrations(migration_id,sha256,engine_version) VALUES (?,?,VERSION())',['010_content_persistence_candidate.sql',pkg.candidateHash]);
  for(const statement of model.ddl)await reference.conn.query(statement);
  const metadata=await expanded.metadata(reference.conn,reference.name);
  const ownerId=uuid(100);await source.conn.execute("INSERT INTO growth_users(id,email,password_hash) VALUES (?,?,'synthetic-disabled')",[ownerId,'archive-owner@example.invalid']);
  for(let i=1;i<=2;i++){
   const organizationId=uuid(i),websiteId=uuid(i+10),reservationId=uuid(i+20),contentId='shared_asset';
   await source.conn.execute('INSERT INTO growth_organizations(id,name) VALUES (?,?)',[organizationId,'Synthetic '+i]);
   await source.conn.execute('INSERT INTO growth_memberships(organization_id,user_id,role) VALUES (?,?,?)',[organizationId,ownerId,'owner']);
   await source.conn.execute("INSERT INTO growth_websites(id,organization_id,domain,platform) VALUES (?,?,?,'static')",[websiteId,organizationId,'archive'+i+'.invalid']);
   await source.conn.execute("INSERT INTO growth_content_policies(organization_id,website_id,content_type) VALUES (?,?,'blog')",[organizationId,websiteId]);
   await source.conn.execute('INSERT INTO growth_organization_budgets(organization_id) VALUES (?)',[organizationId]);
   await source.conn.execute("INSERT INTO growth_ai_reservations(id,organization_id,website_id,content_type,idempotency_key,week_start,month_start,requested_units,estimated_cost_minor,actual_cost_minor,status) VALUES (?,?,?,'blog',?,CURDATE(),CURDATE(),1,0,0,'completed')",[reservationId,organizationId,websiteId,'seed_'+i]);
   const claim:PublicationClaim={organizationId,websiteId,contentId,channel:'site',reservationId,idempotencyKey:`publish:${organizationId}:${websiteId}:${contentId}:site`};
   const providerId='synthetic_'+i,url='https://example.invalid/post/'+i;
   const record={id:contentId,organizationId,websiteId,version:7,stage:'published',eventIds:['observed'],contentType:'blog',sources:[],publication:{providerId,url,observedAt:'2026-10-19T00:00:00Z'}};
   await source.conn.execute('INSERT INTO growth_content_records(organization_id,website_id,id,version,stage,record_json) VALUES (?,?,?,7,?,?)',[organizationId,websiteId,contentId,record.stage,JSON.stringify(record)]);
   await source.conn.execute('INSERT INTO growth_content_events(organization_id,website_id,content_id,event_id,version,actor_id,event_kind,occurred_at,record_json) VALUES (?,?,?,?,?,?,?,?,?)',[organizationId,websiteId,contentId,'observed',7,ownerId,'confirm_publication','2026-10-19 00:00:00.123456',JSON.stringify(record)]);
   await source.conn.execute("INSERT INTO growth_connector_health(organization_id,website_id,channel,status,checked_at,expires_at) VALUES (?,?,'site','disconnected','2026-10-18 00:00:00','2026-10-18 01:00:00')",[organizationId,websiteId]);
   const hash=publicationClaimHash(claim);await source.conn.execute("INSERT INTO growth_publication_claims(organization_id,website_id,content_id,channel,claim_hash,reservation_id,status) VALUES (?,?,?,'site',?,?,'unknown')",[organizationId,websiteId,contentId,hash,reservationId]);
   await source.conn.execute("UPDATE growth_publication_claims SET status='confirmed',provider_id=?,publication_url=? WHERE organization_id=? AND website_id=? AND content_id=? AND channel='site'",[providerId,url,organizationId,websiteId,contentId]);
   const observation:PublicationObservation={issuer:'synthetic_probe',eventId:'observed_'+i,organizationId,websiteId,contentId,channel:'site',reservationId,claimHash:hash,issuedAt:'2026-10-19T00:00:00Z',expiresAt:'2026-10-19T00:01:00Z',result:{kind:'published',providerId,url}};
   const payload=publicationEvidencePayload(observation),proof={observation,signature:createHmac('sha256',key).update(payload).digest('hex')};
   await source.conn.execute('INSERT INTO growth_publication_observations(organization_id,website_id,content_id,channel,issuer,event_id,payload_hash,observation_json) VALUES (?,?,?,?,?,?,?,?)',[organizationId,websiteId,contentId,'site',observation.issuer,observation.eventId,contract.sha(payload),JSON.stringify(proof)]);
  }
  const exported=await expanded.snapshot(source.conn,source.name,metadata,key);
  artifact=fs.mkdtempSync(path.join(os.tmpdir(),'growthos-expanded-v1-'));fs.chmodSync(artifact,0o700);const archivePath=path.join(artifact,'synthetic.gx1');fs.writeFileSync(archivePath,exported,{mode:0o600,flag:'wx'});const bytes=fs.readFileSync(archivePath);assert.equal(contract.sha(bytes),contract.sha(exported),'archive changed on disk');
  const restoreOptions={key,source:source.name,destination:destination.name,reference:metadata};
  await check('populated 20-table archive restores exact hashes, metadata, scopes and terminal claims',async()=>{const result=await expanded.restore(destination.conn,bytes,restoreOptions);assert.equal(result.status,'RESTORE_VERIFIED');assert.equal(result.counts.length,20);});
  await check('wrong destination, populated retry and corrupted bytes refuse',async()=>{
   await assert.rejects(()=>expanded.restore(destination.conn,bytes,restoreOptions),/nonempty or partial/);
   await assert.rejects(()=>expanded.restore(source.conn,bytes,{...restoreOptions,destination:source.name}),/independent disposable/);
   const empty=await database('corrupt'),bad=Buffer.from(bytes);bad[bad.length-20]^=1;await assert.rejects(()=>expanded.restore(empty.conn,bad,{...restoreOptions,destination:empty.name}));assert.equal((await rows(admin,'SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA=?',[empty.name])).length,0);
  });
  await check('interrupted DDL refuses retry and a fresh destination recovers',async()=>{
   const partial=await database('partial');let count=0;const proxy={query:async(sql:string,values:unknown[])=>{if(model.ddl.includes(sql)&&++count===2)throw Error('SYNTHETIC_INTERRUPTION');return partial.conn.query(sql,values);}};
   await assert.rejects(()=>expanded.restore(proxy,bytes,{...restoreOptions,destination:partial.name}),/SYNTHETIC_INTERRUPTION/);
   assert.equal((await rows(admin,'SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA=?',[partial.name])).length,1);
   await assert.rejects(()=>expanded.restore(partial.conn,bytes,{...restoreOptions,destination:partial.name}),/nonempty or partial/);
   const recovery=await database('recovery');await expanded.restore(recovery.conn,bytes,{...restoreOptions,destination:recovery.name});
  });
  await check('restored foreign keys, immutable journals and terminal claims still enforce guards',async()=>{
   await denied(()=>destination.conn.execute("INSERT INTO growth_connector_health(organization_id,website_id,channel,status,checked_at,expires_at) VALUES (?,?,'foreign','unknown',UTC_TIMESTAMP(),UTC_TIMESTAMP()+INTERVAL 1 HOUR)",[uuid(1),uuid(12)]),[1452]);
   for(const table of ['growth_content_events','growth_publication_observations']){await denied(()=>destination.conn.query('DELETE FROM '+table+' LIMIT 1'),[1644]);const col=table==='growth_content_events'?'actor_id':'payload_hash';await denied(()=>destination.conn.query('UPDATE '+table+' SET '+col+'='+col+' LIMIT 1'),[1644]);}
   await denied(()=>destination.conn.query("UPDATE growth_publication_claims SET status='unknown',provider_id=NULL,publication_url=NULL LIMIT 1"),[1644]);
   await denied(()=>destination.conn.query('DELETE FROM growth_publication_claims LIMIT 1'),[1644]);
   await expanded.identity(destination.conn,destination.name);
  });
  console.log(JSON.stringify({status:'PASS_EXPANDED_BACKUP_V1_REAL_MARIADB',tests:passed,contractHash:model.contractHash,archiveSha256:contract.sha(bytes),publishingExecuted:false}));
 }finally{if(artifact)fs.rmSync(artifact,{recursive:true,force:true});for(const conn of all)await conn.end();await admin.end();}
}
main().catch(error=>{console.error(JSON.stringify({status:'FAIL_OR_BLOCKED_EXPANDED_BACKUP_V1',passed,errorCode:error?.code||'CERTIFICATION_ASSERTION',databaseCertified:false}));process.exitCode=1;});
