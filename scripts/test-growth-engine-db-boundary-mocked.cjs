// Mocked transaction boundary only. No database or external connection is initialized.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const source = fs.readFileSync(require('node:path').join(__dirname, '../src/server/mysql-budget-store.ts'), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const calls = [];
const connection = {
  beginTransaction: async () => { calls.push('BEGIN'); },
  execute: async sql => {
    calls.push(sql);
    if (sql.includes('growth_organization_budgets')) return [[{ monthly_limit_minor: '1000', globally_paused: 0 }]];
    if (sql.includes('growth_websites')) return [[{ status: 'active', automation_enabled: 1, verified_at: new Date(), monthly_budget_minor: '100', timezone: 'Asia/Kolkata' }]];
    throw Error('UNEXPECTED_SQL');
  },
  rollback: async () => { calls.push('ROLLBACK'); },
  commit: async () => { calls.push('COMMIT'); },
  release: () => { calls.push('RELEASE'); }
};
const mocks = {
  'node:crypto': require('node:crypto'),
  './mysql': { getMySQLPool: () => ({ getConnection: async () => connection }) },
  './mysql-integer': { exactUnsigned: x => BigInt(x) }
};
const mockedModule = { exports: {} };
vm.runInNewContext(js, { module: mockedModule, exports: mockedModule.exports, Error, require: id => {
  assert.ok(Object.hasOwn(mocks, id), `unexpected import ${id}`); return mocks[id];
} });
(async () => {
  await assert.rejects(mockedModule.exports.reserveMySQLBudget({ organizationId: 'synthetic-org', websiteId: 'synthetic-site', contentType: 'blog',
    idempotencyKey: 'synthetic-key', estimatedCostMinor: 10, maximumJobCostMinor: 10, requestedUnits: 1 }), /TIMEZONE_QUOTA_UNSUPPORTED/);
  assert.ok(calls.includes('ROLLBACK'));
  assert.ok(calls.includes('RELEASE'));
  assert.ok(!calls.includes('COMMIT'));
  assert.equal(calls.filter(x => x.includes('growth_content_policies')).length, 0);
  assert.equal(calls.filter(x => x.startsWith('INSERT')).length, 0);
  console.log('PASS non-UTC site refuses paid reservation and rolls back before policy or insert');
})().catch(error => { console.error(error); process.exitCode = 1; });
