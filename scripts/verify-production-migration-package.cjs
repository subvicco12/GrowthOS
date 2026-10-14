#!/usr/bin/env node
/**
 * GrowthOS production migration package verifier (OFFLINE ONLY).
 * Does not connect to MariaDB, execute SQL, or authorize installation.
 * Generates a manifest and validates 001-009 plus append-only audit guards.
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const dir = path.join(root, 'database', 'mysql');
const expectedCounts = [7,1,1,1,2,1,1,2,3];
const expectedTables = [
  'growth_organizations','growth_users','growth_memberships','growth_websites',
  'growth_content_policies','growth_organization_budgets','growth_ai_reservations',
  'growth_budget_incidents','growth_sessions','growth_login_throttles',
  'growth_installation_state','growth_approval_queue','growth_approval_decisions',
  'growth_website_feature_audit'
];
const manifest = [];
const seenTables = new Set();
const seenTriggers = new Set();
for (let n = 1; n <= 9; n++) {
  const prefix = String(n).padStart(3, '0') + '_';
  const names = fs.readdirSync(dir).filter(name => name.startsWith(prefix) && name.endsWith('.sql'));
  assert.equal(names.length, 1, 'exactly one migration ' + prefix);
  const file = names[0];
  const sql = fs.readFileSync(path.join(dir, file), 'utf8');
  const clean = sql.split('\n').filter(line => !/^\s*--/.test(line)).join('\n');
  assert.doesNotMatch(clean, /\b(?:DROP|TRUNCATE|ALTER|REPLACE|GRANT|REVOKE)\b/i, file + ': prohibited SQL');
  const tables = [...clean.matchAll(/\bCREATE\s+TABLE\s+([a-zA-Z0-9_]+)/gi)].map(m => m[1]);
  const triggers = [...clean.matchAll(/\bCREATE\s+TRIGGER\s+([a-zA-Z0-9_]+)/gi)].map(m => m[1]);
  for (const name of tables) { assert(!seenTables.has(name), 'duplicate table '+name); seenTables.add(name); }
  for (const name of triggers) { assert(!seenTriggers.has(name), 'duplicate trigger '+name); seenTriggers.add(name); }
  const statements = n === 8
    ? clean.split('\n').filter(line => /^CREATE TRIGGER\b/i.test(line.trim())).map(line => line.trim().replace(/\/\/$/, ''))
    : n === 9
      ? [clean.match(/CREATE TABLE[\s\S]*?ENGINE=InnoDB;/i)?.[0], ...[...clean.matchAll(/CREATE TRIGGER[\s\S]*?;/gi)].map(m => m[0])]
      : clean.split(';').map(s => s.trim()).filter(Boolean);
  assert.equal(statements.length, expectedCounts[n-1], file + ': unexpected statement count');
  for (const stmt of statements) assert.match(stmt, /^(?:CREATE TABLE|CREATE TRIGGER|INSERT INTO)\b/i, file + ': unexpected statement');
  manifest.push({file, sha256:crypto.createHash('sha256').update(sql).digest('hex'), statements:statements.length, tables, triggers});
}
for (const name of ['growth_approval_decisions','growth_website_feature_audit']) assert(seenTables.has(name), 'missing audit table '+name);
assert.deepEqual([...seenTables].sort(), [...expectedTables].sort(), 'migration table inventory mismatch');
for (const name of ['approval_audit_update_guard','approval_audit_delete_guard','growth_feature_audit_no_update','growth_feature_audit_no_delete'])
  assert(seenTriggers.has(name), 'missing immutable audit trigger '+name);
const ledger = fs.readFileSync(path.join(dir, '000_migration_ledger.sql'),'utf8');
assert.match(ledger, /CREATE TABLE growth_schema_migrations\b/i);
assert.match(ledger, /sha256 CHAR\(64\)/i);
const output = {status:'OFFLINE_CONTRACT_PASS', installationAuthorized:false, runtimeCertified:false,
  requiredTarget:'dedicated empty GrowthOS schema; manual authorization required',
  prerequisites:['independent production metadata comparison','verified backup and restore rehearsal',
    'privilege review','MariaDB isolated runtime certification','explicit production change approval'],
  ledgerSha256:crypto.createHash('sha256').update(ledger).digest('hex'),
  migrations:manifest};
process.stdout.write(JSON.stringify(output,null,2)+'\n');
