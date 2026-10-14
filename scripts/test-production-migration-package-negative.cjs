#!/usr/bin/env node
// Offline mutation test: a renamed required table must fail the manifest verifier.
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'growthos-manifest-negative-'));
try {
  const scripts = path.join(temp, 'scripts');
  const sql = path.join(temp, 'database', 'mysql');
  fs.mkdirSync(scripts, { recursive: true });
  fs.mkdirSync(sql, { recursive: true });
  fs.copyFileSync(path.join(__dirname, 'verify-production-migration-package.cjs'),
    path.join(scripts, 'verify-production-migration-package.cjs'));
  for (const file of fs.readdirSync(path.join(root, 'database', 'mysql')).filter(f => f.endsWith('.sql')))
    fs.copyFileSync(path.join(root, 'database', 'mysql', file), path.join(sql, file));
  const core = path.join(sql, '001_core_schema.sql');
  const original = fs.readFileSync(core, 'utf8');
  assert.equal(original.includes('CREATE TABLE growth_organizations'), true);
  fs.writeFileSync(core, original.replace('CREATE TABLE growth_organizations', 'CREATE TABLE growth_orgs_missing'));
  const result = spawnSync(process.execPath, [path.join(scripts, 'verify-production-migration-package.cjs')],
    { encoding: 'utf8', timeout: 10000, env: { PATH: process.env.PATH || '' } });
  assert.equal(result.status === 0, false, 'renamed required table must be refused');
  assert.match(result.stderr, /migration table inventory mismatch/);
  console.log('PASS: renamed required table refused by offline migration manifest verifier');
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
