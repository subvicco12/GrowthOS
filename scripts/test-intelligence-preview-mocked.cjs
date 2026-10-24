const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function load(file, mocks) {
  const js = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(js, { module, exports: module.exports, Response, Request, URL, Buffer, TextDecoder, process, Error,
    require: id => { assert.ok(Object.hasOwn(mocks, id), `unexpected import ${id}`); return mocks[id]; } });
  return module.exports;
}
process.env.GROWTHOS_APP_ORIGIN = 'https://growthos.example';
const security = load('src/server/request-security.ts', {});
const pagination = load('src/server/organization-pagination.ts', { zod: require('zod') });
let core;
const id = '00000000-0000-4000-8000-000000000001';
const org = '00000000-0000-4000-8000-000000000002';
const payload = (url = 'https://site.test/pricing') => JSON.stringify({ websiteId: id, pages: [{ url, status: 200, indexable: true, h1Count: 1, wordCount: 100, internalLinks: 1 }] });
const request = (body, origin = 'https://growthos.example') => new Request('https://growthos.example/api/organization-intelligence-preview', {
  method: 'POST', headers: { host: 'growthos.example', origin, 'content-type': 'application/json' }, body });
async function run(body, { error, rows = [{ domain: 'site.test' }] } = {}) {
  const queries = [];
  const route = load('src/app/api/organization-intelligence-preview/route.ts', {
    '../../../core/manual-intelligence-preview': core,
    '../../../server/request-security': security,
    '../../../server/organization-pagination': pagination,
    '../../../server/organization-context': { getAuthenticatedOrganizationContext: async () => {
      if (error) throw Error(error);
      return { organization: { id: org } };
    } },
    '../../../server/mysql': { getMySQLPool: () => ({ execute: async (sql, params) => { queries.push({ sql, params }); return [rows]; } }) }
  });
  const response = await route.POST(request(body));
  return { response, body: await response.json(), queries, route };
}
(async () => {
  core = await import('../src/core/manual-intelligence-preview.ts');
  let checks = 0;
  let result = await run(payload());
  assert.equal(result.response.status, 200); assert.equal(result.body.evidence, 'UNVERIFIED_MANUAL_INPUT');
  assert.deepEqual(Array.from(result.queries[0].params), [org, id]);
  assert.match(result.queries[0].sql, /organization_id=\? AND id=\?/); checks += 4;
  for (const error of ['AUTHENTICATION_REQUIRED', 'ORGANIZATION_FORBIDDEN']) {
    result = await run(payload(), { error }); assert.equal(result.response.status, error === 'AUTHENTICATION_REQUIRED' ? 401 : 403);
    assert.equal(result.queries.length, 0); checks += 2;
  }
  result = await run(payload(), { rows: [] }); assert.equal(result.response.status, 404); checks++;
  result = await run(payload('https://other.test/')); assert.equal(result.response.status, 400); checks++;
  result = await run('{'); assert.equal(result.response.status, 400); assert.equal(result.queries.length, 0); checks += 2;
  result = await run('x'.repeat(5000)); assert.equal(result.response.status, 413); assert.equal(result.queries.length, 0); checks += 2;
  result = await run(payload());
  assert.equal((await result.route.POST(request(payload(), 'https://evil.test'))).status, 403); checks++;
  for (const error of ['AUTHENTICATION_REQUIRED', 'ORGANIZATION_FORBIDDEN', null]) {
    const legacy = load('src/app/api/connection-status/route.ts', {
      '../../../server/organization-pagination': pagination,
      '../../../server/organization-context': { getAuthenticatedOrganizationContext: async () => {
        if (error) throw Error(error);
        return { organization: { id: org } };
      } }
    });
    const response = await legacy.GET(new Request('https://growthos.example/api/connection-status'));
    assert.equal(response.status, error === 'AUTHENTICATION_REQUIRED' ? 401 : error ? 403 : 200);
    if (!error) { const body = await response.json(); assert.equal(body.connection, 'unknown'); assert.equal(body.host, undefined); checks += 2; }
    checks++;
  }
  const evidenceCalls = [];
  const evidenceRoute = (role = 'owner', error = null, mutationFailure = null) => load('src/app/api/organization-intelligence-evidence/route.ts', {
    zod: require('zod'),
    '../../../core/manual-intelligence-preview': { previewInput: core.previewInput },
    '../../../server/request-security': security,
    '../../../server/organization-pagination': pagination,
    '../../../server/mysql': { getMySQLPool: () => ({}) },
    '../../../server/mysql-intelligence-evidence': { MySQLManualEvidenceStore: class {
      async record(input) { evidenceCalls.push(['record',input]); if (mutationFailure) throw Error(mutationFailure); return { id: id, duplicate: false }; }
      async revoke(input) { evidenceCalls.push(['revoke',input]); if (mutationFailure) throw Error(mutationFailure); return true; }
      async list(organizationId, websiteId) { evidenceCalls.push(['list',organizationId,websiteId]); return []; }
    } },
    '../../../server/organization-context': { getAuthenticatedOrganizationContext: async () => {
      if (error) throw Error(error);
      return { userId: id, organization: { id: org, role } };
    } }
  });
  const recordBody = JSON.stringify({ ...JSON.parse(payload()), idempotencyKey: 'synthetic-request',
    sourceLabel: 'manual', observedAt: '2026-10-24T10:00:00Z', expiresAt: '2026-10-25T10:00:00Z' });
  const before = evidenceCalls.length;
  assert.equal((await evidenceRoute('viewer').POST(request(recordBody))).status, 403); checks++;
  assert.equal((await evidenceRoute('owner','AUTHENTICATION_REQUIRED').POST(request(recordBody))).status, 401); checks++;
  assert.equal((await evidenceRoute().POST(request(recordBody,'https://evil.test'))).status, 403); checks++;
  assert.equal((await evidenceRoute().POST(request('x'.repeat(5000)))).status, 413); checks++;
  assert.equal(evidenceCalls.length, before); checks++;
  assert.equal((await evidenceRoute().POST(request(recordBody))).status, 201); checks++;
  assert.equal(evidenceCalls.at(-1)[1].organizationId, org); checks++;
  assert.equal((await evidenceRoute('viewer').PATCH(request(JSON.stringify({ websiteId: id, evidenceId: id })))).status, 403); checks++;
  assert.equal((await evidenceRoute().PATCH(request(JSON.stringify({ websiteId: id, evidenceId: id })))).status, 200); checks++;
  for (const operation of ['POST','PATCH']) {
    const response = await evidenceRoute('owner', null, 'EVIDENCE_COMMIT_UNKNOWN')[operation](request(operation === 'POST' ? recordBody : JSON.stringify({ websiteId: id, evidenceId: id })));
    assert.equal(response.status, 503);
    assert.equal((await response.json()).code, 'EVIDENCE_OUTCOME_UNKNOWN_OPERATOR_HOLD'); checks += 2;
  }
  const listing = await evidenceRoute().GET(new Request('https://growthos.example/api/organization-intelligence-evidence?websiteId=' + id));
  assert.equal(listing.status, 200);
  const scoped = await listing.json(); assert.equal(scoped.organizationId, org); assert.equal(scoped.websiteId, id);
  assert.equal(scoped.verifiedEvidenceAvailable, false); checks += 4;
  console.log(`PASS ${checks} mocked route assertions: scoped preview, denial, malformed and oversized input, forged origin`);
})().catch(error => { console.error(error); process.exitCode = 1; });
