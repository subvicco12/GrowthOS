// Isolated route contract checks. Authentication and SQL are mocked.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const uuid = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const org = uuid(1);
function load(file, mocks = {}) {
  const source = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(js, { module, exports: module.exports, Response, URL, Buffer, TextDecoder, Error, require: id => {
    assert.ok(Object.hasOwn(mocks, id), `unexpected import ${id}`); return mocks[id];
  } });
  return module.exports;
}
const pagination = load('src/server/organization-pagination.ts', { zod: require('zod') });
async function run(file, url, { error, sqlError = false, rows = [], organizationId = org } = {}) {
  const queries = [];
  const mocks = {
    '../../../server/organization-context': { getAuthenticatedOrganizationContext: async () => {
      if (error) throw Error(error);
      return { organization: { id: organizationId, name: 'Synthetic', role: 'owner' } };
    } },
    '../../../server/mysql': { getMySQLPool: () => ({ execute: async (sql, params) => {
      queries.push({ sql, params }); if (sqlError) throw Error('DATABASE_UNAVAILABLE'); return [rows];
    } }) },
    '../../../server/organization-pagination': pagination,
    '../../../server/request-security': {}, '../../../core/website-domain-schema': { websiteDomainSchema: require('zod').z.string() },
    'node:crypto': require('node:crypto'), zod: require('zod'),
    '../../../core/admin-website-access': { assertWebsiteAdminAccess: () => {} }
  };
  const route = load(file, mocks);
  const response = await route.GET(new Request(url));
  return { response, body: await response.json(), queries };
}
const governance = 'src/app/api/organization-governance/route.ts';
const approvals = 'src/app/api/organization-approvals/route.ts';
const websites = 'src/app/api/organization-websites/route.ts';
const connectors = 'src/app/api/organization-connectors/route.ts';
const costs = 'src/app/api/organization-costs/route.ts';
const base = 'https://example.invalid/';
const stamp = '2026-10-18 00:00:00';
const auditRows = Array.from({ length: 26 }, (_, i) => ({ id: uuid(i + 10), website_id: uuid(3), cursor_created_at: stamp, created_at: stamp, feature: 'automation' }));
(async () => {
  let r = await run(governance, base + '?stream=features', { rows: auditRows });
  assert.equal(r.response.status, 200); assert.equal(r.body.items.length, 25); assert.ok(r.body.nextCursor);
  assert.equal(r.response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(Array.from(r.queries[0].params), [org, 26]);
  assert.match(r.queries[0].sql, /WHERE organization_id=\?/);
  r = await run(governance, base + '?stream=features&cursor=' + encodeURIComponent(r.body.nextCursor));
  assert.equal(r.response.status, 200);
  assert.deepEqual(Array.from(r.queries[0].params), [org, stamp, stamp, uuid(34), 26]);
  assert.match(r.queries[0].sql, /created_at<\?/);
  console.log('PASS audit keyset pagination with tenant parameter on every page');
  for (const [file, url] of [[websites, base], [approvals, base], [connectors, base]]) {
    r = await run(file, url, { rows: auditRows.map((x, i) => ({ ...x, domain: `site${i}.invalid` })) });
    assert.equal(r.response.status, 200); assert.ok(r.body.nextCursor); assert.equal(r.queries[0].params[0], org);
    const second = await run(file, url + '?cursor=' + encodeURIComponent(r.body.nextCursor));
    assert.equal(second.response.status, 200); assert.equal(second.queries[0].params[0], org);
    assert.match(second.queries[0].sql, /id>\?/);
    const denied = await run(file, url + '?cursor=' + encodeURIComponent(r.body.nextCursor), { error: 'ORGANIZATION_FORBIDDEN' });
    assert.equal(denied.response.status, 403); assert.equal(denied.queries.length, 0);
    const foreignPage = await run(file, url + '?cursor=' + encodeURIComponent(r.body.nextCursor), { organizationId: uuid(2) });
    assert.equal(foreignPage.response.status, 400); assert.equal(foreignPage.queries.length, 0);
    console.log('PASS', file, 'bounded keyset and tenant scope');
  }
  const foreign = pagination.nextPageCursor(uuid(2), 'features', stamp, uuid(34));
  for (const cursor of [foreign, '!!!', pagination.nextPageCursor(org, 'decisions', stamp, uuid(34))]) {
    r = await run(governance, base + '?stream=features&cursor=' + encodeURIComponent(cursor));
    assert.equal(r.response.status, 400); assert.equal(r.queries.length, 0);
  }
  console.log('PASS foreign, malformed and wrong-stream cursors refused before SQL');
  r = await run(governance, base + '?stream=invalid'); assert.equal(r.response.status, 400); assert.equal(r.queries.length, 0);
  for (const [error, status] of [['AUTHENTICATION_REQUIRED', 401], ['ORGANIZATION_REQUIRED', 403], ['ORGANIZATION_FORBIDDEN', 403]]) {
    r = await run(governance, base + '?stream=features', { error });
    assert.equal(r.response.status, status); assert.equal(r.queries.length, 0);
  }
  r = await run(governance, base + '?stream=features', { sqlError: true }); assert.equal(r.response.status, 503);
  console.log('PASS authentication, authorization and database failures fail closed');
  r = await run(connectors, base, { rows: [{ id: uuid(3), domain: 'site.invalid', platform: 'wordpress' }] });
  assert.equal(r.body.connectors[0].state, 'unknown'); assert.equal(r.body.connectors[0].checkedAt, null);
  assert.equal(r.body.disconnectedRequiresExplicitPersistedEvidence, true);
  console.log('PASS connector configuration cannot imply health');
  r = await run(costs, base, { rows: [{ website_id: uuid(3), recorded_minor: '370', completed_count: 2 }] });
  assert.equal(r.response.status, 200); assert.equal(r.body.currency, null);
  assert.equal(r.body.providerBilledSpendAvailable, false);
  assert.equal(r.body.recordedCompletedCosts[0].recordedMinor, '370');
  assert.equal(r.queries[0].params[0], org); assert.equal(r.queries[0].params[2], 'completed');
  assert.match(r.queries[0].sql, /actual_cost_minor IS NOT NULL/);
  console.log('PASS cost ledger read is scoped to completed persisted actual amounts');
})().catch(error => { console.error(error); process.exitCode = 1; });
