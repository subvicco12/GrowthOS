// Isolated session lifecycle contract: no MariaDB or network connection.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const calls = [];
let userDisabled = false;
let issuedHash;
let revoked = false;
const pool = {
  async execute(sql, params) {
    calls.push({ sql, params });
    if (sql.startsWith('SELECT id AS user_id')) {
      return [[userDisabled ? { user_id: params[0], disabled: 1 } : { user_id: params[0], disabled: 0 }]];
    }
    if (sql.startsWith('INSERT INTO growth_sessions')) {
      issuedHash = params[2];
      assert.match(issuedHash, /^[a-f0-9]{64}$/);
      assert.equal(params[1], 'synthetic-user');
      return [{ affectedRows: 1 }];
    }
    if (sql.startsWith('SELECT s.user_id')) {
      return [[params[0] === issuedHash && !revoked && !userDisabled ? { user_id: 'synthetic-user', disabled: 0 } : { user_id: 'synthetic-user', disabled: 1 }]];
    }
    if (sql.startsWith('UPDATE growth_sessions')) {
      assert.equal(params[0], issuedHash);
      revoked = true;
      return [{ affectedRows: 1 }];
    }
    throw Error('Unexpected SQL: ' + sql);
  }
};

const file = path.resolve(__dirname, '../src/server/mysql-session.ts');
const compiled = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText;
const moduleObject = { exports: {} };
vm.runInNewContext(compiled, {
  module: moduleObject, exports: moduleObject.exports, Date, Error,
  require: name => {
    if (name === 'node:crypto') return require('node:crypto');
    if (name === './mysql') return { getMySQLPool: () => pool };
    throw Error('Unexpected import: ' + name);
  }
});
const { issueMySQLSession, verifyMySQLSession, revokeMySQLSession } = moduleObject.exports;

async function run() {
  await assert.rejects(() => issueMySQLSession(''), /INVALID_USER/);
  assert.equal(await verifyMySQLSession(undefined), null);
  assert.equal(await verifyMySQLSession('x'.repeat(257)), null);
  await revokeMySQLSession('');
  await revokeMySQLSession('x'.repeat(257));
  assert.equal(calls.length, 0, 'invalid tokens must not reach the database');

  userDisabled = true;
  await assert.rejects(() => issueMySQLSession('synthetic-user'), /USER_DISABLED/);
  assert.equal(calls.filter(c => c.sql.startsWith('INSERT')).length, 0);
  userDisabled = false;

  const { token, expiresAt } = await issueMySQLSession('synthetic-user');
  assert.match(token, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(expiresAt instanceof Date, true);
  assert.equal(expiresAt.getTime() > Date.now(), true);
  assert.equal(issuedHash.includes(token), false);
  assert.equal(await verifyMySQLSession(token), 'synthetic-user');
  assert.equal(await verifyMySQLSession('wrong-token'), null);

  userDisabled = true;
  assert.equal(await verifyMySQLSession(token), null);
  userDisabled = false;

  await revokeMySQLSession(token);
  assert.equal(revoked, true);
  assert.equal(await verifyMySQLSession(token), null);
  console.log('PASS isolated session issuance, hashing, expiry, disabled-user refusal and revocation');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
