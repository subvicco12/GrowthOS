const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function load(file, mocks) {
  const js = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(js, { module, exports: module.exports, Response, Request, URL, Buffer, TextDecoder, process, Error,
    require: id => { assert.ok(Object.hasOwn(mocks,id), `unexpected import ${id}`); return mocks[id]; } });
  return module.exports;
}
process.env.GROWTHOS_APP_ORIGIN = 'https://growthos.example';
const security = load('src/server/request-security.ts', {});
const org = '00000000-0000-4000-8000-000000000002';
const other = '00000000-0000-4000-8000-000000000003';
const calls = [];
const route = load('src/app/api/organization-websites/route.ts', {
  zod: require('zod'), 'node:crypto': { randomUUID: ()=>'00000000-0000-4000-8000-000000000004' },
  '../../../server/request-security': security,
  '../../../core/website-domain-schema': { websiteDomainSchema: require('zod').z.string().min(3) },
  '../../../core/admin-website-access': { assertWebsiteAdminAccess: (member, id) => {
    if (member.organizationId !== id || !['owner','admin'].includes(member.role)) throw Error('INSUFFICIENT_ROLE');
  } },
  '../../../server/organization-context': { getAuthenticatedOrganizationContext: async request => {
    if (request.headers.get('x-test-signed-out') === 'yes') throw Error('AUTHENTICATION_REQUIRED');
    return { userId: 'actor', organization: { id: org, role: request.headers.get('x-test-role') || 'owner' } };
  } },
  '../../../server/mysql': { getMySQLPool: () => ({ execute: async (sql, params) => { calls.push([sql,params]);
    if (sql.startsWith('SELECT')) return [[{id:'site',domain:'example.test',platform:'wordpress',status:'draft',
      verified_at:null,automation_enabled:'0',auto_publish_enabled:'0',monthly_budget_minor:'0'}]];
    return [{}]; } }) },
  '../../../server/organization-pagination': { PAGE_SIZE:25, readPageCursor:()=>null,
    nextPageCursor:()=>null, pageError: error => Response.json({code:String(error)}, {status:503}) }
});
function request(organizationId, headers = {}) {
  return new Request('https://growthos.example/api/organization-websites', { method:'POST',
    headers: { host:'growthos.example', origin:'https://growthos.example', 'content-type':'application/json', ...headers },
    body:JSON.stringify({organizationId,domain:'example.test',platform:'wordpress'}) });
}
(async()=>{
  assert.equal((await route.POST(request(other))).status,403);
  assert.equal(calls.length,0);
  assert.equal((await route.POST(request(org,{'x-test-role':'viewer'}))).status,403);
  assert.equal((await route.POST(request(org,{'x-test-signed-out':'yes'}))).status,401);
  assert.equal((await route.POST(request(org,{origin:'https://evil.test'}))).status,403);
  assert.equal(calls.length,0);
  assert.equal((await route.POST(request(org))).status,201);
  assert.equal(calls.length,1);
  assert.equal(calls[0][1][1],org);
  const listing = await route.GET(new Request('https://growthos.example/api/organization-websites'));
  assert.equal(listing.status,200);
  const body = await listing.json();
  assert.equal(body.websites[0].automationEnabled,false);
  assert.equal(body.websites[0].autoPublishEnabled,false);
  console.log('PASS 11 mocked registration and registry assertions');
})().catch(error=>{console.error(error);process.exitCode=1;});
