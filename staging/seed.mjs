import mysql from 'mysql2/promise';
import { hashPassword } from '../src/server/password-hashing.ts';
import { orgA,orgB,siteA,siteB,approvalA,actors } from './fixture.mjs';
const e=process.env;
if (e.GROWTHOS_TEST_DB_DISPOSABLE !== 'YES' || !/^growthos_test_[a-z0-9_]+$/.test(e.GROWTHOS_DB_NAME||'') || e.GROWTHOS_DB_HOST !== '127.0.0.1' || e.GROWTHOS_DB_PORT !== '33317' || !e.GROWTHOS_STAGING_USER_PASSWORD?.startsWith('synthetic_')) throw Error('REFUSED: synthetic disposable preflight required');
const db=await mysql.createConnection({host:e.GROWTHOS_DB_HOST,port:33317,user:e.GROWTHOS_DB_USER,password:e.GROWTHOS_DB_PASSWORD,database:e.GROWTHOS_DB_NAME,multipleStatements:false});
try {
  const [[identity]]=await db.query('SELECT DATABASE() AS db,VERSION() AS version');
  if (identity.db!==e.GROWTHOS_DB_NAME || !/^11\.8\./.test(identity.version)) throw Error('REFUSED: database identity/version mismatch');
  const [ledger]=await db.query('SELECT migration_id FROM growth_schema_migrations');
  if (ledger.length!==9) throw Error('REFUSED: nine migrations required');
  for (const table of ['growth_organizations','growth_users','growth_memberships','growth_websites','growth_approval_queue','growth_approval_decisions','growth_sessions']) {
    const [[{ count }]]=await db.query(`SELECT COUNT(*) AS count FROM ${table}`);
    if (count!==0) throw Error('REFUSED: fixture requires empty application tables');
  }
  const hash=await hashPassword(e.GROWTHOS_STAGING_USER_PASSWORD);
  await db.beginTransaction();
  for (const [id,name] of [[orgA,'Synthetic A'],[orgB,'Synthetic B']]) {
    await db.execute('INSERT INTO growth_organizations(id,name) VALUES (?,?)',[id,name]);
    await db.execute('INSERT INTO growth_organization_budgets(organization_id) VALUES (?)',[id]);
  }
  for (const a of actors) {
    await db.execute('INSERT INTO growth_users(id,email,password_hash,disabled) VALUES (?,?,?,FALSE)',[a.id,a.email,hash]);
    await db.execute('INSERT INTO growth_memberships(organization_id,user_id,role) VALUES (?,?,?)',[a.org,a.id,a.role]);
  }
  for (const [id,org,domain] of [[siteA,orgA,'a.example.invalid'],[siteB,orgB,'b.example.invalid']]) {
    await db.execute("INSERT INTO growth_websites(id,organization_id,domain,platform,status,automation_enabled,auto_publish_enabled) VALUES (?,?,?,'static','draft',FALSE,FALSE)",[id,org,domain]);
  }
  await db.execute("INSERT INTO growth_approval_queue(id,organization_id,website_id,title,action_type) VALUES (?,?,?,'Synthetic review','internal_only')",[approvalA,orgA,siteA]);
  await db.commit();
  console.log('PASS synthetic staging fixture: two organizations, six users, two disabled draft websites, one internal approval');
} catch(error) { await db.rollback(); throw error; } finally { await db.end(); }
