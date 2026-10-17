// Isolated route contract checks: authentication and SQL are mocked, no network or database.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const source = fs.readFileSync(path.join(__dirname, '../src/app/api/organization-governance/route.ts'), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;

async function run({ error, sqlError = false, org = 'synthetic-org-a' } = {}) {
  const queries = [];
  const mocks = {
    '../../../server/organization-context': { getAuthenticatedOrganizationContext: async () => {
      if (error) throw Error(error);
      return { organization: { id: org } };
    } },
    '../../../server/mysql': { getMySQLPool: () => ({ execute: async (sql, params) => {
      queries.push({ sql, params });
      if (sqlError) throw Error('DATABASE_UNAVAILABLE');
      return [[{ id: 'synthetic-entry' }]];
    } }) }
  };
  const module = { exports: {} };
  vm.runInNewContext(js, { module, exports: module.exports, Response, Error, require: id => {
    assert.ok(Object.hasOwn(mocks, id), `unexpected import ${id}`);
    return mocks[id];
  } });
  const response = await module.exports.GET(new Request('https://example.invalid/api/organization-governance'));
  return { response, body: await response.json(), queries };
}

(async () => {
  let result = await run();
  assert.equal(result.response.status, 200);
  assert.equal(result.response.headers.get('cache-control'), 'no-store');
  assert.equal(result.queries.length, 2);
  for (const { sql, params } of result.queries) {
    assert.match(sql, /WHERE organization_id=\?/);
    assert.match(sql, /LIMIT 100/);
    assert.deepEqual(Array.from(params), ['synthetic-org-a']);
  }
  assert.equal(result.body.limitedToLatest100PerType, true);
  console.log('PASS selected organization scopes and bounds both audit queries');
  for (const [error, status] of [['AUTHENTICATION_REQUIRED', 401], ['ORGANIZATION_REQUIRED', 403], ['ORGANIZATION_FORBIDDEN', 403]]) {
    result = await run({ error });
    assert.equal(result.response.status, status);
    assert.equal(result.queries.length, 0);
    console.log(`PASS ${error} refused without database access`);
  }
  result = await run({ sqlError: true });
  assert.equal(result.response.status, 503);
  assert.equal(result.response.headers.get('cache-control'), 'no-store');
  console.log('PASS database failure fails closed');
})().catch(error => { console.error(error); process.exitCode = 1; });
