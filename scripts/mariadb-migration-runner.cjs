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
const files = fs.readdirSync(folder).filter(f => /^00[1-8]_.*\.sql$/.test(f)).sort();
if (files.length !== 8 || files.some((f,i) => !f.startsWith(String(i+1).padStart(3,'0')+'_'))) throw Error('Expected exactly migrations 001..008');
const migrations = files.map(file => {
  const sql = fs.readFileSync(path.join(folder,file),'utf8');
  return {file, sql, hash:crypto.createHash('sha256').update(sql).digest('hex')};
});
const objects = migrations.flatMap(m => [...m.sql.matchAll(/CREATE\s+TABLE\s+(\w+)/gi)].map(x=>x[1]));
const triggers = ['approval_audit_update_guard','approval_audit_delete_guard'];
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
      if (m.file.startsWith('008_')) {
        statements = m.sql.split('\n').filter(line=>/^CREATE TRIGGER /i.test(line.trim())).map(line=>line.trim().replace(/\/\/$/,''));
      } else {
        statements = m.sql.split(';').map(s=>s.trim()).filter(Boolean).map(s=>s.replace(/^(?:--[^\n]*\n\s*)+/gm,'').trim()).filter(Boolean);
      }
      for (const sql of statements) await conn.query(sql);
      await conn.execute('INSERT INTO growth_schema_migrations(migration_id,sha256,engine_version) VALUES (?,?,?)',[m.file,m.hash,version.v]);
      console.log('APPLIED IN DISPOSABLE TEST SCHEMA:',m.file);
    }
    const [rows] = await conn.query('SELECT migration_id,sha256 FROM growth_schema_migrations ORDER BY migration_id');
    if (rows.length !== 8 || rows.some((row,i)=>row.migration_id!==migrations[i].file || row.sha256!==migrations[i].hash)) throw Error('Ledger validation failed');
    console.log('PASS: 8 migrations recorded in disposable MariaDB schema. No cleanup performed.');
  } finally { await conn.end(); }
})().catch(e=>{console.error('TEST FAILED:',e.message);process.exitCode=1;});
