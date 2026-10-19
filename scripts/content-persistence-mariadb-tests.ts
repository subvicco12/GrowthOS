/** Real MariaDB tests only. This worker re-verifies owned Docker isolation before connecting. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { randomBytes, createHmac } from 'node:crypto';
import mysql, { type Pool, type RowDataPacket, type Connection } from 'mysql2/promise';
import { MySQLContentStore } from '../src/server/mysql-content-store';
import { MySQLPublicationClaimStore } from '../src/server/mysql-publication-claim-store';
import { PublicationEvidenceVerifier, publicationEvidencePayload, publicationClaimHash, type PublicationObservation } from '../src/server/publication-evidence';
import { applyContentEvent, type ContentActor, type ContentEvent } from '../src/core/content-lifecycle';
import type { PublicationClaim } from '../src/core/publication-handoff';
const contract = require('./lib/content-certification-package.cjs');
type Row = RowDataPacket & Record<string, unknown>;
interface Config { host:string;port:number;password:string;db:string;containerHostname:string;synthetic:boolean;containerId:string;name:string;networkName:string;nonce:string;imageRef:string;configDir:string }
const uuid = (n:number) => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const org=uuid(1),site=uuid(2),otherOrg=uuid(3),otherSite=uuid(4),owner=uuid(5),reservation=uuid(6),otherReservation=uuid(7);
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
async function installBaseline(c:Config,db:string,admin:Connection){
 assert.match(db,/^growthos_test_cert_[a-f0-9]+(?:_[a-z]+)?$/);await admin.query('CREATE DATABASE `'+db+'` CHARACTER SET utf8mb4 COLLATE utf8mb4_uca1400_ai_ci');
 const result=spawnSync(process.execPath,[path.join(contract.root,'scripts/production-migration-executor-candidate.cjs'),'--test-disposable'],{encoding:'utf8',timeout:30000,env:{NODE_ENV:'test',PATH:process.env.PATH,GROWTHOS_DB_HOST:c.host,GROWTHOS_DB_PORT:String(c.port),GROWTHOS_DB_NAME:db,GROWTHOS_DB_USER:'root',GROWTHOS_DB_PASSWORD:c.password,GROWTHOS_MIGRATION_TEST_DISPOSABLE:'YES'}});
 assert.equal(result.status,0,'certified baseline installation failed');
}
async function installCandidate(conn:Connection,db:string){
 assert.match(db,/^growthos_test_cert_[a-f0-9]+(?:_[a-z]+)?$/);
 const [identity]=await rows(conn,'SELECT DATABASE() AS db');assert.equal(identity.db,db);
 const [lock]=await rows(conn,'SELECT GET_LOCK(?,0) AS acquired',['gcert:'+db]);assert.equal(Number(lock.acquired),1);
 try {
  const pkg=contract.verifyPackage();const inventory=await rows(conn,'SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA=?',[db]);
  assert.equal(inventory.length,15,'partial/expanded installation: refuse retry');
  const triggers=await rows(conn,'SELECT TRIGGER_NAME FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=?',[db]);assert.equal(triggers.length,4);
  const ledger=await rows(conn,'SELECT migration_id,sha256 FROM growth_schema_migrations ORDER BY migration_id');assert.equal(ledger.length,9);
  pkg.migrations.forEach((m:{file:string;sha256:string},i:number)=>{assert.equal(ledger[i].migration_id,m.file);assert.equal(ledger[i].sha256,m.sha256);});
  const columns=await rows(conn,"SELECT TABLE_NAME,COLUMN_NAME,COLLATION_NAME,CHARACTER_MAXIMUM_LENGTH FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=? AND TABLE_NAME IN ('growth_websites','growth_ai_reservations') AND COLUMN_NAME IN ('organization_id','id','website_id')",[db]);
  assert.equal(columns.length,5);for(const column of columns){assert.equal(column.COLLATION_NAME,'utf8mb4_uca1400_ai_ci');assert.equal(Number(column.CHARACTER_MAXIMUM_LENGTH),36);}
  assert.equal((await rows(conn,"SELECT INDEX_NAME FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=? AND TABLE_NAME='growth_ai_reservations' AND INDEX_NAME='uq_reservation_scope'",[db])).length,0,'partial index: refuse retry');
  const [settings]=await rows(conn,'SELECT @@innodb_page_size AS page_size,@@foreign_key_checks AS fk,@@check_constraint_checks AS checks,@@sql_mode AS mode');assert.equal(Number(settings.page_size),16384);assert.equal(Number(settings.fk),1);assert.equal(Number(settings.checks),1);assert.match(String(settings.mode),/STRICT_(TRANS|ALL)_TABLES/);
  for(const statement of pkg.statements)await conn.query(statement);
  await conn.execute('INSERT INTO growth_schema_migrations(migration_id,sha256,engine_version) VALUES (?,?,VERSION())',['010_content_persistence_candidate.sql',pkg.candidateHash]);
 } finally {await conn.query('SELECT RELEASE_LOCK(?)',['gcert:'+db]);}
}

async function main(){
 const c=readConfig();const pkg=contract.verifyPackage();
 const options={host:c.host,port:c.port,user:'root',password:c.password,timezone:'Z',multipleStatements:false,connectTimeout:2000};
 let admin:Connection|undefined;for(let i=0;i<60;i++){try{admin=await mysql.createConnection(options);break;}catch{await new Promise(resolve=>setTimeout(resolve,500));}}
 assert.ok(admin,'owned MariaDB did not become ready');const server=admin;
 const pools:Pool[]=[];const connections:Connection[]=[];
 try {
  const [identity]=await rows(server,'SELECT VERSION() AS version,@@hostname AS hostname,@@port AS port');
  assert.match(String(identity.version),/^11\.8\.\d+.*MariaDB/i);assert.equal(identity.hostname,c.containerHostname);assert.equal(Number(identity.port),3306);
  await installBaseline(c,c.db,server);await server.changeUser({database:c.db});await installCandidate(server,c.db);
  await check('20 InnoDB tables, 11 triggers, 40 FK columns and ten pinned ledger entries',async()=>{
   const tables=await rows(server,'SELECT TABLE_NAME,ENGINE FROM information_schema.TABLES WHERE TABLE_SCHEMA=?',[c.db]);assert.equal(tables.length,20);assert.ok(tables.every(t=>t.ENGINE==='InnoDB'));
   assert.equal((await rows(server,'SELECT TRIGGER_NAME FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=?',[c.db])).length,11);
   assert.equal((await rows(server,'SELECT COLUMN_NAME FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA=? AND REFERENCED_TABLE_NAME IS NOT NULL',[c.db])).length,40);
   const ledger=await rows(server,'SELECT migration_id,sha256 FROM growth_schema_migrations ORDER BY migration_id');assert.equal(ledger.length,10);pkg.migrations.forEach((m:{file:string;sha256:string},i:number)=>assert.equal(ledger[i].sha256,m.sha256));assert.equal(ledger[9].sha256,pkg.candidateHash);
  });
  await server.execute('INSERT INTO growth_organizations(id,name) VALUES (?,?),(?,?)',[org,'Synthetic A',otherOrg,'Synthetic B']);
  await server.execute("INSERT INTO growth_users(id,email,password_hash) VALUES (?,?,'synthetic-disabled')",[owner,'owner@example.invalid']);
  for(const [organizationId,websiteId,reservationId] of [[org,site,reservation],[otherOrg,otherSite,otherReservation]]) {
   // These are isolated data fixtures only: no application, publisher, queue or schedule is started.
   await server.execute("INSERT INTO growth_websites(id,organization_id,domain,platform,status,verified_at,automation_enabled,auto_publish_enabled,monthly_budget_minor) VALUES (?,?,?,'static','active',UTC_TIMESTAMP(),TRUE,TRUE,100)",[websiteId,organizationId,websiteId+'.invalid']);
   await server.execute('INSERT INTO growth_organization_budgets(organization_id,monthly_limit_minor,globally_paused) VALUES (?,100,FALSE)',[organizationId]);
   await server.execute("INSERT INTO growth_content_policies(organization_id,website_id,content_type,enabled,auto_publish,weekly_limit,monthly_budget_minor,max_job_cost_minor) VALUES (?,?,'blog',TRUE,TRUE,10,100,25)",[organizationId,websiteId]);
   await server.execute("INSERT INTO growth_ai_reservations(id,organization_id,website_id,content_type,idempotency_key,week_start,month_start,requested_units,estimated_cost_minor,actual_cost_minor,status) VALUES (?,?,?,'blog',?,CURDATE(),CURDATE(),1,25,20,'completed')",[reservationId,organizationId,websiteId,'seed_'+reservationId]);
   await server.execute("INSERT INTO growth_connector_health(organization_id,website_id,channel,status,checked_at,expires_at) VALUES (?,?,'site','verified',UTC_TIMESTAMP()-INTERVAL 1 MINUTE,UTC_TIMESTAMP()+INTERVAL 1 HOUR)",[organizationId,websiteId]);
  }
  const writerPassword=randomBytes(32).toString('hex'),readerPassword=randomBytes(32).toString('hex');
  await server.query("CREATE USER 'gcert_writer'@'%' IDENTIFIED BY "+server.escape(writerPassword));await server.query("CREATE USER 'gcert_reader'@'%' IDENTIFIED BY "+server.escape(readerPassword));
  const target='`'+c.db+'`.';
  for(const table of ['growth_websites','growth_organization_budgets','growth_content_policies','growth_ai_reservations','growth_connector_health'])await server.query("GRANT SELECT ON "+target+table+" TO 'gcert_writer'@'%'");
  for(const table of ['growth_content_records','growth_content_events','growth_publication_claims','growth_publication_observations'])await server.query("GRANT SELECT,INSERT ON "+target+table+" TO 'gcert_writer'@'%'");
  await server.query("GRANT UPDATE(version,stage,record_json) ON "+target+"growth_content_records TO 'gcert_writer'@'%'");
  await server.query("GRANT UPDATE(status,provider_id,publication_url) ON "+target+"growth_publication_claims TO 'gcert_writer'@'%'");
  for(const table of pkg.newTables)await server.query("GRANT SELECT ON "+target+table+" TO 'gcert_reader'@'%'");
  const pool=(user:string,password:string)=>{const p=mysql.createPool({...options,database:c.db,user,password,connectionLimit:1,queueLimit:10});pools.push(p);return p;};
  const p1=pool('gcert_writer',writerPassword),p2=pool('gcert_writer',writerPassword),reader=pool('gcert_reader',readerPassword);
  assert.notEqual((await rows(p1,'SELECT CONNECTION_ID() AS id'))[0].id,(await rows(p2,'SELECT CONNECTION_ID() AS id'))[0].id,'two independent database sessions required');
  const actor:ContentActor={userId:owner,organizationId:org,websiteId:site,role:'owner'};
  const content1=new MySQLContentStore(p1),content2=new MySQLContentStore(p2);
  async function scheduled(id:string){
   const start=Date.now()-600000;await content1.create({id,organizationId:org,websiteId:site,contentType:'blog'});
   const events:ContentEvent[]=[{kind:'research',sources:[{url:'https://example.invalid/source',observedAt:new Date(start).toISOString(),claim:'synthetic'}],eventId:'research',at:new Date(start).toISOString()},
    {kind:'draft',text:'Synthetic certification draft with original material.',eventId:'draft',at:new Date(start+1000).toISOString()},
    {kind:'quality',regulated:false,evidence:{factual:true,original:true,rightsCleared:true,disclosureChecked:true,ymylReviewed:true,notes:'synthetic'},eventId:'quality',at:new Date(start+2000).toISOString()},
    {kind:'approve',eventId:'approve',at:new Date(start+3000).toISOString()},{kind:'schedule',channel:'site',publishAt:new Date(start+5000).toISOString(),eventId:'schedule',at:new Date(start+4000).toISOString()}];
   for(let i=0;i<events.length;i++)await applyContentEvent(content1,id,i,events[i],actor);
   return {organizationId:org,websiteId:site,contentId:id,channel:'site',reservationId:reservation,idempotencyKey:`publish:${org}:${site}:${id}:site`} satisfies PublicationClaim;
  }
  const secret=randomBytes(32),issuer={id:'synthetic_probe',secret,revoked:false,organizationId:org,websiteId:site,channel:'site'};
  const verifier=new PublicationEvidenceVerifier([issuer]),claims1=new MySQLPublicationClaimStore(p1,verifier),claims2=new MySQLPublicationClaimStore(p2,verifier);
  function evidence(claim:PublicationClaim,eventId:string,result:PublicationObservation['result'],expired=false){const now=Date.now(),observation:PublicationObservation={issuer:issuer.id,eventId,organizationId:org,websiteId:site,contentId:claim.contentId,channel:'site',reservationId:reservation,claimHash:publicationClaimHash(claim),issuedAt:new Date(now-1000).toISOString(),expiresAt:new Date(now+(expired?-1:60000)).toISOString(),result};return {observation,signature:createHmac('sha256',secret).update(publicationEvidencePayload(observation)).digest('hex')};}
  const first=await scheduled('concurrent_claim');
  await check('two-session unique claim, atomic unknown content and duplicate refusal',async()=>{
   const result=await Promise.all([claims1.claimOnce(first),claims2.claimOnce(first)]);assert.deepEqual(result.slice().sort(),[false,true]);
   assert.equal((await content1.get(org,site,first.contentId))?.stage,'publication_unknown');
   const count=await rows(server,'SELECT COUNT(*) AS n FROM growth_publication_claims WHERE organization_id=? AND website_id=? AND content_id=?',[org,site,first.contentId]);assert.equal(Number(count[0].n),1);
   await denied(()=>server.execute("INSERT INTO growth_publication_claims(organization_id,website_id,content_id,channel,claim_hash,reservation_id,status) VALUES (?,?,?,'site',?,?,'unknown')",[org,site,first.contentId,publicationClaimHash(first),reservation]),[1062]);
  });
  await check('two-session optimistic content CAS',async()=>{await scheduled('cas');const event={kind:'cancel' as const,at:new Date().toISOString()};const results=await Promise.allSettled([applyContentEvent(content1,'cas',5,{...event,eventId:'cancel_a'},actor),applyContentEvent(content2,'cas',5,{...event,eventId:'cancel_b'},actor)]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal((await content1.get(org,site,'cas'))?.version,6);});
  await check('tenant, website, viewer and approval-event replay denial',async()=>{
   assert.equal(await content1.get(otherOrg,site,first.contentId),null);assert.equal(await content1.get(org,otherSite,first.contentId),null);
   await assert.rejects(()=>applyContentEvent(content1,first.contentId,6,{kind:'cancel',eventId:'viewer',at:new Date().toISOString()},{...actor,role:'viewer'}),/CONTENT_ROLE_DENIED/);
   await scheduled('approval_replay');await assert.rejects(()=>applyContentEvent(content1,'approval_replay',5,{kind:'approve',eventId:'approve',at:new Date().toISOString()},actor),/INVALID_CONTENT_EVENT/);
   await denied(()=>server.execute('INSERT INTO growth_content_records(organization_id,website_id,id,version,stage,record_json) VALUES (?,?,?,0,?,?)',[otherOrg,site,'cross','proposed',JSON.stringify({organizationId:otherOrg,websiteId:site,id:'cross',version:0,stage:'proposed',eventIds:[]})]),[1452]);
   const bad={...first,contentId:'approval_replay',idempotencyKey:`publish:${org}:${site}:approval_replay:site`};
   await denied(()=>server.execute("INSERT INTO growth_publication_claims(organization_id,website_id,content_id,channel,claim_hash,reservation_id,status) VALUES (?,?,?,'site',?,?,'unknown')",[org,site,bad.contentId,publicationClaimHash(bad),otherReservation]),[1452]);
  });
  await check('JSON scope mirrors and initial claim state are enforced by constraints/triggers',async()=>{
   const record=(await content1.get(org,site,'approval_replay'))!;
   await denied(()=>server.execute('INSERT INTO growth_content_records(organization_id,website_id,id,version,stage,record_json) VALUES (?,?,?,?,?,?)',[org,site,'json_mismatch',record.version,record.stage,JSON.stringify(record)]),[4025]);
   await denied(()=>server.execute('INSERT INTO growth_content_events(organization_id,website_id,content_id,event_id,version,actor_id,event_kind,occurred_at,record_json) VALUES (?,?,?,?,?,?,?,?,?)',[org,site,'approval_replay','json_mismatch',99,owner,'cancel',new Date(),JSON.stringify({...record,organizationId:otherOrg,version:99})]),[4025]);
   await denied(()=>server.execute("INSERT INTO growth_publication_claims(organization_id,website_id,content_id,channel,claim_hash,reservation_id,status,provider_id,publication_url) VALUES (?,?,?,'site',?,?,'confirmed','forged','https://example.invalid/forged')",[org,site,'approval_replay','b'.repeat(64),reservation]),[1644]);
  });
  await check('stale connector refuses a new claim',async()=>{const claim=await scheduled('stale');await server.execute('UPDATE growth_connector_health SET checked_at=UTC_TIMESTAMP()-INTERVAL 2 HOUR,expires_at=UTC_TIMESTAMP()-INTERVAL 1 HOUR WHERE organization_id=? AND website_id=?',[org,site]);await assert.rejects(()=>claims1.claimOnce(claim),/CONNECTOR_UNAVAILABLE/);assert.equal((await content1.get(org,site,'stale'))?.stage,'scheduled');await server.execute('UPDATE growth_connector_health SET checked_at=UTC_TIMESTAMP(),expires_at=UTC_TIMESTAMP()+INTERVAL 1 HOUR WHERE organization_id=? AND website_id=?',[org,site]);});
  await check('claim insertion rolls back when the content audit insert fails',async()=>{
   const claim=await scheduled('atomic_fail');await server.query("CREATE TRIGGER gcert_fail_event BEFORE INSERT ON growth_content_events FOR EACH ROW BEGIN IF NEW.content_id='atomic_fail' AND NEW.event_kind='publication_unknown' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='SYNTHETIC_FAILURE'; END IF; END");
   try{await assert.rejects(()=>claims1.claimOnce(claim));assert.equal((await content1.get(org,site,claim.contentId))?.stage,'scheduled');assert.equal(Number((await rows(server,'SELECT COUNT(*) AS n FROM growth_publication_claims WHERE content_id=?',[claim.contentId]))[0].n),0);}finally{await server.query('DROP TRIGGER gcert_fail_event');}
   assert.equal(await claims1.claimOnce(claim),true);
  });
  const observed=evidence(first,'observed_first',{kind:'published',providerId:'synthetic_post',url:'https://example.invalid/post'});
  await check('signed reconciliation, exact replay, conflicting event replay and terminal refusal',async()=>{
   await assert.rejects(()=>claims1.reconcile(first,evidence(first,'expired',{kind:'unknown'},true)),/EXPIRED/);
   await assert.rejects(()=>claims1.reconcile(first,{...observed,signature:'0'.repeat(64)}),/SIGNATURE_INVALID/);
   assert.equal(await claims1.reconcile(first,observed),'confirmed');const version=(await content1.get(org,site,first.contentId))?.version;
   assert.equal(await claims2.reconcile(first,observed),'confirmed');assert.equal((await content2.get(org,site,first.contentId))?.version,version);
   await assert.rejects(()=>claims1.reconcile(first,evidence(first,'observed_first',{kind:'absent'})),/EVIDENCE_REPLAY/);assert.equal(await claims1.claimOnce(first),false);
  });
  await check('reconciliation SQL failure rolls back observation, content and status',async()=>{
   const claim=await scheduled('reconcile_fail');await claims1.claimOnce(claim);const proof=evidence(claim,'recovery_event',{kind:'published',providerId:'synthetic_failure',url:'https://example.invalid/recovery'});
   await server.query("CREATE TRIGGER gcert_fail_claim BEFORE UPDATE ON growth_publication_claims FOR EACH ROW BEGIN IF NEW.content_id='reconcile_fail' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='SYNTHETIC_FAILURE'; END IF; END");
   try{await assert.rejects(()=>claims1.reconcile(claim,proof));assert.equal((await content1.get(org,site,claim.contentId))?.stage,'publication_unknown');assert.equal(Number((await rows(server,'SELECT COUNT(*) AS n FROM growth_publication_observations WHERE event_id=?',['recovery_event']))[0].n),0);}finally{await server.query('DROP TRIGGER gcert_fail_claim');}
   assert.equal(await claims1.reconcile(claim,proof),'confirmed');
  });
  await check('verified absence is terminal and signed foreign scope is refused',async()=>{
   const claim=await scheduled('absent');await claims1.claimOnce(claim);
   const proof=evidence(claim,'foreign_scope',{kind:'unknown'});proof.observation.organizationId=otherOrg;proof.signature=createHmac('sha256',secret).update(publicationEvidencePayload(proof.observation)).digest('hex');
   await assert.rejects(()=>claims1.reconcile(claim,proof),/SCOPE_DENIED/);
   assert.equal(await claims1.reconcile(claim,evidence(claim,'absent_event',{kind:'absent'})),'absent');assert.equal(await claims1.claimOnce(claim),false);
   await denied(()=>server.execute("UPDATE growth_publication_claims SET status='unknown' WHERE claim_hash=?",[publicationClaimHash(claim)]),[1644]);
  });
  await check('new audit journals reject UPDATE/DELETE even for the synthetic installer',async()=>{for(const table of ['growth_content_events','growth_publication_observations']){const column=table==='growth_content_events'?'actor_id':'payload_hash';await denied(()=>server.query('UPDATE '+table+' SET '+column+'='+column+' LIMIT 1'),[1644]);await denied(()=>server.query('DELETE FROM '+table+' LIMIT 1'),[1644]);}});
  await check('claim identity, deletion, terminal resets and terminal rewrites are immutable',async()=>{
   for(const column of ['organization_id','website_id','content_id','channel','claim_hash','reservation_id'])await denied(()=>server.execute('UPDATE growth_publication_claims SET '+column+'=? WHERE claim_hash=?',['changed',publicationClaimHash(first)]),[1644]);
   await denied(()=>server.execute('UPDATE growth_publication_claims SET created_at=created_at+INTERVAL 1 SECOND WHERE claim_hash=?',[publicationClaimHash(first)]),[1644]);
   await denied(()=>server.execute("UPDATE growth_publication_claims SET status='unknown',provider_id=NULL,publication_url=NULL WHERE claim_hash=?",[publicationClaimHash(first)]),[1644]);
   await denied(()=>server.execute('UPDATE growth_publication_claims SET status=status WHERE claim_hash=?',[publicationClaimHash(first)]),[1644]);await denied(()=>server.execute('DELETE FROM growth_publication_claims WHERE claim_hash=?',[publicationClaimHash(first)]),[1644]);
  });
  await check('least-privilege writer/reader cannot alter schema, audit or claim identity',async()=>{
   await denied(()=>p1.query('CREATE TABLE forbidden(id INT)'),[1142]);await denied(()=>p1.query('DELETE FROM growth_content_events'),[1142]);await denied(()=>p1.query("UPDATE growth_publication_claims SET claim_hash='changed'"),[1142,1143]);await denied(()=>reader.query("UPDATE growth_content_records SET stage='cancelled'"),[1142]);
  });
  await check('interrupted transaction is rolled back and same event safely recovers',async()=>{
   const claim=await scheduled('interrupted');const connection=await mysql.createConnection({...options,user:'gcert_writer',password:writerPassword,database:c.db});
   const before=(await content1.get(org,site,claim.contentId))!;const next={...before,version:before.version+1,stage:'cancelled',eventIds:[...before.eventIds,'interrupted_cancel']};
   await connection.beginTransaction();await connection.execute('UPDATE growth_content_records SET version=?,stage=?,record_json=? WHERE organization_id=? AND website_id=? AND id=? AND version=?',[next.version,next.stage,JSON.stringify(next),org,site,claim.contentId,before.version]);
   await connection.execute('INSERT INTO growth_content_events(organization_id,website_id,content_id,event_id,version,actor_id,event_kind,occurred_at,record_json) VALUES (?,?,?,?,?,?,?,?,?)',[org,site,claim.contentId,'interrupted_cancel',next.version,owner,'cancel',new Date(),JSON.stringify(next)]);connection.destroy();
   await server.beginTransaction();await server.execute('SELECT version FROM growth_content_records WHERE organization_id=? AND website_id=? AND id=? FOR UPDATE',[org,site,claim.contentId]);await server.rollback();assert.equal((await content1.get(org,site,claim.contentId))?.version,5);
   assert.equal(Number((await rows(server,'SELECT COUNT(*) AS n FROM growth_content_events WHERE content_id=? AND event_id=?',[claim.contentId,'interrupted_cancel']))[0].n),0);
   await applyContentEvent(content1,claim.contentId,5,{kind:'cancel',eventId:'interrupted_cancel',at:new Date().toISOString()},actor);
  });
  await check('two-session deadlock returns an explicit victim and rolls back without auto-retry',async()=>{
   await scheduled('deadlock_a');await scheduled('deadlock_b');const a=await mysql.createConnection({...options,database:c.db}),b=await mysql.createConnection({...options,database:c.db});connections.push(a,b);
   await a.query('SET SESSION innodb_lock_wait_timeout=3');await b.query('SET SESSION innodb_lock_wait_timeout=3');await a.beginTransaction();await b.beginTransaction();
   try{await a.query("SELECT id FROM growth_content_records WHERE organization_id=? AND website_id=? AND id='deadlock_a' FOR UPDATE",[org,site]);await b.query("SELECT id FROM growth_content_records WHERE organization_id=? AND website_id=? AND id='deadlock_b' FOR UPDATE",[org,site]);
    const results=await Promise.allSettled([a.query("SELECT id FROM growth_content_records WHERE organization_id=? AND website_id=? AND id='deadlock_b' FOR UPDATE",[org,site]),b.query("SELECT id FROM growth_content_records WHERE organization_id=? AND website_id=? AND id='deadlock_a' FOR UPDATE",[org,site])]);
    assert.equal(results.filter(r=>r.status==='rejected'&&Number(r.reason.errno)===1213).length,1);
   }finally{await a.rollback();await b.rollback();}
   assert.equal((await content1.get(org,site,'deadlock_a'))?.version,5);
  });
  await check('partial DDL and completed installs refuse retry; a new disposable schema recovers',async()=>{
   const partial=c.db+'_partial';await installBaseline(c,partial,server);const p=await mysql.createConnection({...options,database:partial});connections.push(p);await p.query(pkg.statements[0]);await assert.rejects(()=>installCandidate(p,partial),/partial\/expanded/);
   await assert.rejects(()=>installCandidate(server,c.db),/partial\/expanded/);const recovery=c.db+'_recovery';await installBaseline(c,recovery,server);const r=await mysql.createConnection({...options,database:recovery});connections.push(r);await installCandidate(r,recovery);
  });
  await check('certified restore refuses expanded source before invoking clients; destination stays empty',async()=>{
   const dest=c.db+'_restore';await server.query('CREATE DATABASE `'+dest+'` CHARACTER SET utf8mb4 COLLATE utf8mb4_uca1400_ai_ci');
   const r=spawnSync(process.execPath,[path.join(contract.root,'scripts/disposable-backup-restore-rehearsal-candidate.cjs'),'--rehearse'],{encoding:'utf8',timeout:15000,env:{NODE_ENV:'test',PATH:process.env.PATH,GROWTHOS_DB_HOST:c.host,GROWTHOS_DB_PORT:String(c.port),GROWTHOS_DB_USER:'root',GROWTHOS_DB_PASSWORD:c.password,GROWTHOS_BACKUP_SOURCE:c.db,GROWTHOS_BACKUP_DEST:dest,GROWTHOS_BACKUP_TEST_DISPOSABLE:'YES'}});
   assert.equal(r.status,1);assert.match(r.stderr,/15 InnoDB tables required/);assert.equal((await rows(server,'SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA=?',[dest])).length,0);
  });
  console.log(JSON.stringify({status:'PASS_REAL_MARIADB',testCount:passed,version:identity.version,candidateHash:pkg.candidateHash,database:c.db,publicationExecuted:false}));
 }finally{for(const connection of connections)await connection.end();for(const p of pools)await p.end();await server.end();}
}
main().catch(error=>{console.error(JSON.stringify({status:'FAIL_OR_BLOCKED_REAL_MARIADB',passed,errorCode:error?.code||'CERTIFICATION_ASSERTION',databaseCertified:false}));process.exitCode=1;});
