#!/usr/bin/env node
/**
 * Growth OS migration planner and disposable-schema test runner.
 * Default: OFFLINE PLAN ONLY. Never accepts the designated production database.
 * Test execution: GROWTHOS_MIGRATION_TEST_DISPOSABLE=YES and --test-disposable.
 * Requires mysql2 only for test execution; no network connection in plan mode.
 * Does not create/drop databases or alter production data.
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const folder = path.join(root, 'database/mysql');
const files = fs.readdirSync(folder).filter(f => /^00[1-9]_.*\.sql$/.test(f)).sort();
if (files.length !== 9 || files.some((f,i) => !f.startsWith(String(i+1).padStart(3,'0')+'_'))) throw Error('Expected exactly migrations 001..009');
const migrations = files.map(file => {
  const sql = fs.readFileSync(path.join(folder,file),'utf8');
  return {file, sql, hash:crypto.createHash('sha256').update(sql).digest('hex')};
});
const objects = migrations.flatMap(m => [...m.sql.matchAll(/CREATE\s+TABLE\s+(\w+)/gi)].map(x=>x[1]));
const triggers = ['approval_audit_update_guard','approval_audit_delete_guard','growth_feature_audit_no_update','growth_feature_audit_no_delete'];
const mode = process.argv.includes('--test-disposable');
if (!mode) {
  for (const m of migrations) console.log(m.file, m.hash);
  console.log('PLAN ONLY: no database connection. Tables:',objects.join(', '));
  console.log('Trigger objects:',triggers.join(', '));
  process.exit(0);
}
const db = process.env.GROWTHOS_DB_NAME || '';
if (process.env.GROWTHOS_MIGRATION_TEST_DISPOSABLE !== 'YES' ||
    !/^growthos_test_[A-Za-z0-9_]+$/.test(db) ||
    db === 'u917733804_BtNpX') {
  throw Error('REFUSED: execution requires explicit disposable test schema growthos_test_* and confirmation');
}
// A disposable schema name does not prove that the server is disposable.
// Require loopback transport; Docker/container service names must be forwarded locally.
const testHost = process.env.GROWTHOS_DB_HOST || '127.0.0.1';
if (!['127.0.0.1', 'localhost', '::1'].includes(testHost)) {
  throw Error('REFUSED: disposable MariaDB testing requires a local loopback host');
}
(async()=>{
  const mysql = require('mysql2/promise');
  const conn = await mysql.createConnection({
    host:process.env.GROWTHOS_DB_HOST || '127.0.0.1',
    port:Number(process.env.GROWTHOS_DB_PORT || 3306),
    user:process.env.GROWTHOS_DB_USER,
    password:process.env.GROWTHOS_DB_PASSWORD,
    database:db,
    multipleStatements:false
  });
  try {
    const [existing] = await conn.query('SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE()');
    const [existingTriggers] = await conn.query('SELECT TRIGGER_NAME FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE()');
    if (existing.length || existingTriggers.length) throw Error('REFUSED: disposable schema must be completely empty');
    const [[version]] = await conn.query('SELECT VERSION() AS v');
    if (!/MariaDB/i.test(version.v)) throw Error('Expected MariaDB test server, got '+version.v);
    const ledger = fs.readFileSync(path.join(folder,'000_migration_ledger.sql'),'utf8').trim();
    await conn.query(ledger);
    for (const m of migrations) {
      // Trigger statements have client DELIMITER syntax; send each CREATE TRIGGER to server directly.
      let statements;
      if (m.file.startsWith('008_') || m.file.startsWith('009_')) {
        if (m.file.startsWith('009_')) {
          const table = m.sql.match(/CREATE TABLE[\s\S]*?ENGINE=InnoDB;/i)?.[0];
          const guards = [...m.sql.matchAll(/CREATE TRIGGER[\s\S]*?;/gi)].map(match => match[0]);
          if (!table || guards.length !== 2) throw Error('Expected feature audit table and two guards');
          statements = [table, ...guards];
        }
        else
        statements = m.sql.split('\n').filter(line=>/^CREATE TRIGGER /i.test(line.trim())).map(line=>line.trim().replace(/\/\/$/,''));
      } else {
        const uncommented = m.sql.split('\n').filter(line => !/^\s*--/.test(line)).join('\n');
        statements = uncommented.split(';').map(part => part.trim()).filter(Boolean);
        if (statements.some(part => !/^(CREATE TABLE|INSERT INTO)\b/i.test(part))) throw Error('Unexpected SQL statement in ' + m.file);
      }
      for (const sql of statements) await conn.query(sql);
      await conn.execute('INSERT INTO growth_schema_migrations(migration_id,sha256,engine_version) VALUES (?,?,?)',[m.file,m.hash,version.v]);
      console.log('APPLIED IN DISPOSABLE TEST SCHEMA:',m.file);
    }
    const [rows] = await conn.query('SELECT migration_id,sha256 FROM growth_schema_migrations ORDER BY migration_id');
    if (rows.length !== 9 || rows.some((row,i)=>row.migration_id!==migrations[i].file || row.sha256!==migrations[i].hash)) throw Error('Ledger validation failed');
    const [tables] = await conn.query("SELECT TABLE_NAME, ENGINE FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE()");
    const expectedTables = new Set([...objects, 'growth_schema_migrations']);
    if (tables.length !== expectedTables.size ||
        tables.some(t => !expectedTables.has(t.TABLE_NAME) || t.ENGINE !== 'InnoDB')) {
      throw Error('Unexpected table inventory or non-InnoDB engine');
    }
    const [installedTriggers] = await conn.query("SELECT TRIGGER_NAME, EVENT_OBJECT_TABLE FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE()");
    if (installedTriggers.length !== 4 ||
        installedTriggers.some(t => !triggers.includes(t.TRIGGER_NAME) || !(['approval_audit_update_guard','approval_audit_delete_guard'].includes(t.TRIGGER_NAME) ? t.EVENT_OBJECT_TABLE === 'growth_approval_decisions' : t.EVENT_OBJECT_TABLE === 'growth_website_feature_audit'))) {
      throw Error('Audit trigger inventory mismatch');
    }
    const [foreignKeys] = await conn.query("SELECT TABLE_NAME, REFERENCED_TABLE_NAME FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA=DATABASE() AND REFERENCED_TABLE_NAME IS NOT NULL");
    if (foreignKeys.length < 10) throw Error('Expected foreign keys missing: found ' + foreignKeys.length);
    // Functional FK and audit-trigger checks are confined to a transaction in the disposable schema.
    const { randomUUID } = crypto;
    const org=randomUUID(), user=randomUUID(), site=randomUUID(), approval=randomUUID(), decision=randomUUID();
    await conn.beginTransaction();
    try {
      await conn.execute('INSERT INTO growth_organizations(id,name) VALUES (?,?)',[org,'Disposable QA']);
      await conn.execute('INSERT INTO growth_users(id,email,password_hash) VALUES (?,?,?)',[user,'qa-'+randomUUID()+'@example.invalid','disabled-test-hash']);
      await conn.execute('INSERT INTO growth_websites(id,organization_id,domain,platform) VALUES (?,?,?,?)',[site,org,'qa.example.invalid','custom']);
      await conn.execute('INSERT INTO growth_approval_queue(id,organization_id,website_id,title,action_type) VALUES (?,?,?,?,?)',[approval,org,site,'QA approval','test']);
      await conn.execute('INSERT INTO growth_approval_decisions(id,organization_id,website_id,approval_id,actor_id,idempotency_key,decision) VALUES (?,?,?,?,?,?,?)',[decision,org,site,approval,user,randomUUID(),'deferred']);
      async function mustReject(sql, params, label) {
        try { await conn.execute(sql,params); }
        catch (e) { if (e.sqlState === '45000' && /AUDIT_IMMUTABLE/.test(e.message)) return; throw Error(label+' rejected for unexpected reason: '+e.message); }
        throw Error(label+' unexpectedly succeeded');
      }
      await mustReject('UPDATE growth_approval_decisions SET note=? WHERE id=?',['tamper',decision],'Audit UPDATE');
      await mustReject('DELETE FROM growth_approval_decisions WHERE id=?',[decision],'Audit DELETE');
      await conn.execute(
        'INSERT INTO growth_website_feature_audit(id,organization_id,website_id,actor_id,feature,enabled) VALUES (?,?,?,?,?,FALSE)',
        [randomUUID(),org,site,user,'automation']
      );
      const [[featureEntry]] = await conn.execute(
        'SELECT id FROM growth_website_feature_audit WHERE organization_id=? AND website_id=?',
        [org,site]
      );
      async function mustRejectFeature(sql, params, label) {
        try { await conn.execute(sql, params); }
        catch (e) {
          if (e.sqlState === '45000' && /Feature audit entries/.test(e.message)) return;
          throw Error(label + ' rejected for unexpected reason: ' + e.message);
        }
        throw Error(label + ' unexpectedly succeeded');
      }
      await mustRejectFeature('UPDATE growth_website_feature_audit SET feature=? WHERE id=?',['auto_publish',featureEntry.id],'Feature audit UPDATE');
      await mustRejectFeature('DELETE FROM growth_website_feature_audit WHERE id=?',[featureEntry.id],'Feature audit DELETE');
      let rejected=false;
      try { await conn.execute('INSERT INTO growth_memberships(organization_id,user_id,role) VALUES (?,?,?)',[randomUUID(),user,'viewer']); }
      catch(e) { if (e.code === 'ER_NO_REFERENCED_ROW_2') rejected=true; else throw e; }
      if (!rejected) throw Error('Foreign-key violation was not rejected');
    } finally { await conn.rollback(); }
    console.log('PASS: 9 migrations, '+tables.length+' InnoDB tables, 4 audit triggers, '+foreignKeys.length+' foreign-key columns, functional audit/FK checks. No cleanup performed.');
  } finally { await conn.end(); }
})().catch(e=>{console.error('TEST FAILED:',e.message);process.exitCode=1;});
