#!/usr/bin/env node
// Explicit test-only installation of independently reviewable proposal 017. Never installs 010–016.
const fs = require('node:fs'), path = require('node:path');
if (process.env.GROWTHOS_SESSION02_DISPOSABLE !== 'YES' || process.env.GROWTHOS_TEST_DB_DISPOSABLE !== 'YES' ||
    !/^growthos_test_[A-Za-z0-9_]+$/.test(process.env.GROWTHOS_DB_NAME || '') ||
    !['127.0.0.1','localhost','::1'].includes(process.env.GROWTHOS_DB_HOST || '')) {
  console.error('REFUSED: explicit Session 02 disposable local schema opt-in required.'); process.exit(2);
}
(async () => {
  const connection = await require('mysql2/promise').createConnection({ host: process.env.GROWTHOS_DB_HOST, port: Number(process.env.GROWTHOS_DB_PORT || 3306),
    database: process.env.GROWTHOS_DB_NAME, user: process.env.GROWTHOS_DB_USER, password: process.env.GROWTHOS_DB_PASSWORD, multipleStatements: false });
  try {
    const [[version]] = await connection.query('SELECT VERSION() AS version');
    if (!/^11\.8\..*MariaDB/.test(version.version)) throw Error('MariaDB 11.8 disposable server required');
    const [tables] = await connection.query("SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME LIKE 'growth_dev_%'");
    if (tables.length) throw Error('REFUSED: discard partially installed disposable schema instead of reinstalling');
    const sql = fs.readFileSync(path.join(__dirname,'../database/proposals/session02-isolated-workflows/017_session02_disposable_candidate.sql'),'utf8');
    const statements = sql.split('\n').filter(line => !line.trim().startsWith('--')).join('\n').split(';').map(s => s.trim()).filter(Boolean);
    for (const statement of statements) {
      if (!/^(CREATE TABLE growth_dev_|CREATE TRIGGER dev_|INSERT INTO growth_dev_contract)/.test(statement)) throw Error('Unexpected statement in proposal');
      await connection.query(statement);
    }
    console.log('PASS: proposal 017 installed ONLY in explicit disposable schema; 010–016 untouched.');
  } finally { await connection.end(); }
})().catch(error => { console.error(error.code || error.message); process.exitCode = 1; });
