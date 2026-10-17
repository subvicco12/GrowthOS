// Synthetic route contracts. No database or network access.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
process.env.GROWTHOS_APP_ORIGIN = 'https://growthos.example';
function load(file, mocks = {}) {
  const source = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(js, { module, exports: module.exports, Response, URL, Buffer, TextDecoder, process, Error,
    require: name => { if (!(name in mocks)) throw Error('Missing mock: ' + name); return mocks[name]; } });
  return module.exports;
}
const security = load('src/server/request-security.ts');
const routes = [
  ['src/app/api/auth/login/route.ts', '../../../../server/request-security', { zod: require('zod'), '../../../../server/mysql-login': { loginWithPassword: async () => { throw Error('INVALID_CREDENTIALS'); } }, '../../../../server/authenticated-website-access': { SESSION_COOKIE_NAME: 'growthos_session' }, '../../../../server/organization-context': { ORGANIZATION_COOKIE_NAME: 'growthos_organization' } }],
  ['src/app/api/organizations/selection/route.ts', '../../../../server/request-security', { '../../../../server/organization-context': { getAuthenticatedOrganizationChoices: async () => ({ organizations: [] }), ORGANIZATION_COOKIE_NAME: 'growthos_organization' } }],
  ['src/app/api/admin/websites/register/route.ts', '../../../../../server/request-security', { zod: require('zod'), '../../../../../server/authenticated-website-access': { requireWebsiteAccess: async () => { throw Error('INSUFFICIENT_ROLE'); } }, '../../../../../server/mysql-website-registry': { registerMySQLWebsite: async () => { throw Error('UNEXPECTED_WRITE'); } } }],
  ['src/app/api/admin/approvals/decide/route.ts', '../../../../../server/request-security', { zod: require('zod'), '../../../../../server/authenticated-website-access': { requireWebsiteAccess: async () => { throw Error('INSUFFICIENT_ROLE'); } }, '../../../../../server/mysql-approval-decision': { decideInternalApproval: async () => { throw Error('UNEXPECTED_WRITE'); } } }],
  ['src/app/api/organization-websites/route.ts', '../../../server/request-security', { zod: require('zod'), 'node:crypto': require('node:crypto'), '../../../core/website-domain-schema': { websiteDomainSchema: require('zod').z.string() }, '../../../core/admin-website-access': { assertWebsiteAdminAccess: () => {} }, '../../../server/organization-context': { getAuthenticatedOrganizationContext: async () => ({ userId: 'synthetic', organization: { id: 'org-a', role: 'owner' } }) }, '../../../server/mysql': { getMySQLPool: () => { throw Error('UNEXPECTED_DB'); } } }]
];
const headers = (origin = 'https://growthos.example', host = 'growthos.example') => ({ origin, host });
const req = (body, h = headers()) => new Request('https://growthos.example/test', { method: 'POST', headers: h, body });
(async () => {
  let count = 0;
  for (const [file, importName, mocks] of routes) {
    const route = load(file, { ...mocks, [importName]: security });
    const name = file.split('/').slice(-3).join('/');
    for (const h of [headers('https://evil.example', 'evil.example'), headers('https://growthos.example', 'evil.example'), headers('https://evil.example', 'growthos.example'), { ...headers('https://evil.example', 'evil.example'), 'x-forwarded-host': 'growthos.example', 'x-forwarded-proto': 'https' }]) {
      assert.equal((await route.POST(req('{}', h))).status, 403, name);
      count++;
    }
    assert.equal((await route.POST(req('x'.repeat(4097)))).status, 413, name); count++;
    assert.equal((await route.POST(req('{}', { ...headers(), 'content-length': '4097' }))).status, 413, name); count++;
    assert.equal((await route.POST(req('{broken'))).status, 400, name); count++;
    console.log('PASS', name, 'forged origin/Host, forwarding headers, oversized and malformed JSON');
  }
  const approval = load(routes[3][0], { ...routes[3][2], [routes[3][1]]: security });
  const id = '00000000-0000-4000-8000-000000000001';
  const payload = JSON.stringify({ organizationId: id, websiteId: id, approvalId: id, idempotencyKey: 'synthetic-key', decision: 'approved' });
  assert.equal((await approval.POST(req(payload))).status, 403); count++;
  console.log('PASS approval unauthorized role refused before mutation');
  const selection = load(routes[1][0], { [routes[1][1]]: security, '../../../../server/organization-context': { getAuthenticatedOrganizationChoices: async () => ({ organizations: [{ id: '00000000-0000-4000-8000-000000000002' }] }), ORGANIZATION_COOKIE_NAME: 'growthos_organization' } });
  assert.equal((await selection.POST(req(JSON.stringify({ organizationId: id })))).status, 403); count++;
  console.log('PASS cross-tenant organization selection refused');
  assert.equal(security.rejectUntrustedOrigin(req('{}', { ...headers(), 'x-forwarded-host': 'evil.example', 'x-forwarded-proto': 'http' })), null); count++;
  console.log('PASS forwarding headers cannot override canonical Host and Origin');
  for (const invalid of [undefined, 'http://growthos.example', 'https://evil.example/path', 'https://growthos.example?x=1']) {
    if (invalid === undefined) delete process.env.GROWTHOS_APP_ORIGIN;
    else process.env.GROWTHOS_APP_ORIGIN = invalid;
    assert.equal(security.rejectUntrustedOrigin(req('{}', headers())).status, 403); count++;
  }
  process.env.GROWTHOS_APP_ORIGIN = 'https://growthos.example';
  assert.equal((await security.readBoundedJson(req('{}', { ...headers(), 'content-length': 'not-a-number' }))).error.status, 413); count++;
  console.log('PASS missing/invalid canonical configuration and malformed length fail closed');
  for (const length of ['-1', '1.5', '1e3', '9007199254740992']) {
    assert.equal((await security.readBoundedJson(req('{}', { ...headers(), 'content-length': length }))).error.status, 413); count++;
  }
  const malformedUtf8 = new Request('https://growthos.example/test', {
    method: 'POST', body: Uint8Array.from([0x7b, 0x22, 0x78, 0x22, 0x3a, 0x22, 0xc3, 0x28, 0x22, 0x7d])
  });
  assert.equal((await security.readBoundedJson(malformedUtf8)).error.status, 400); count++;
  const failedStream = new ReadableStream({ start(controller) { controller.error(new Error('synthetic stream failure')); } });
  assert.equal((await security.readBoundedJson({ headers: new Headers(), body: failedStream })).error.status, 400); count++;
  const aborted = new ReadableStream({ start(controller) { controller.error(new DOMException('aborted', 'AbortError')); } });
  assert.equal((await security.readBoundedJson({ headers: new Headers(), body: aborted })).error.status, 400); count++;
  let canceled = false;
  const oversizedStream = new ReadableStream({
    pull(controller) { controller.enqueue(new Uint8Array(2049)); },
    cancel() { canceled = true; }
  });
  assert.equal((await security.readBoundedJson({ headers: new Headers(), body: oversizedStream })).error.status, 413); count++;
  assert.equal(canceled, true); count++;
  console.log('PASS malformed Content-Length, invalid UTF-8, stream failures, aborts and streaming size cap');
  console.log(`PASS ${count} offline mutation security assertions`);
})().catch(error => { console.error(error); process.exitCode = 1; });
