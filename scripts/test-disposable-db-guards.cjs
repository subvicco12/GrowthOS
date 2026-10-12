#!/usr/bin/env node
// Dependency-free, offline regression checks. Must never open a DB connection.
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const scripts = [
  { name: 'migration runner', file: 'scripts/mariadb-migration-runner.cjs', args: ['--test-disposable'], flag: 'GROWTHOS_MIGRATION_TEST_DISPOSABLE' },
  { name: 'approval integration', file: 'scripts/run-approval-integration.mjs', args: [], flag: 'GROWTHOS_TEST_DB_DISPOSABLE' }
];
const cases = [
  { name: 'remote host', host: 'db.example.invalid', db: 'growthos_test_isolated', flag: 'YES', expected: /local loopback host/ },
  { name: 'production database name', host: '127.0.0.1', db: 'u917733804_BtNpX', flag: 'YES', expected: /REFUSED/ },
  { name: 'non-test database name', host: '127.0.0.1', db: 'growthos_live', flag: 'YES', expected: /REFUSED/ },
  { name: 'missing disposable opt-in', host: '127.0.0.1', db: 'growthos_test_isolated', flag: '', expected: /REFUSED/ }
];
for (const script of scripts) {
  for (const item of cases) {
    const env = {
      PATH: process.env.PATH || '',
      GROWTHOS_DB_HOST: item.host,
      GROWTHOS_DB_NAME: item.db,
      GROWTHOS_DB_USER: 'test_only',
      GROWTHOS_DB_PASSWORD: 'synthetic-not-a-secret',
      [script.flag]: item.flag
    };
    const result = spawnSync(process.execPath, [path.join(root, script.file), ...script.args], {
      cwd: root, env, encoding: 'utf8', timeout: 10000
    });
    assert.equal(result.status === 0, false, script.name + ' must refuse ' + item.name);
    assert.match((result.stderr || '') + (result.stdout || ''), item.expected, script.name + ': ' + item.name);
    console.log('PASS:', script.name, 'refuses', item.name);
  }
}
console.log('PASS: 8 offline database guard refusals. No connection attempts were authorized.');
