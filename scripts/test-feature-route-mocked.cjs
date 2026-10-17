// Isolated, dependency-light route behavior tests. Requires the TypeScript dev dependency.
// Authentication and database operations are mocked; no database connections occur.
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const ts = require('typescript');
const file = require('node:path').join(__dirname, '../src/app/api/website-features/route.ts');
process.env.GROWTHOS_APP_ORIGIN = 'https://growthos.example';
const helperFile = require('node:path').join(__dirname, '../src/server/request-security.ts');
const helperModule = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync(helperFile, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { module: helperModule, exports: helperModule.exports, Response, URL, Buffer, process });
const js = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText;

async function runCase({ enabled = 1, found = true, role = 'owner', failInsert = false, body = null, declaredLength = null, origin = 'https://growthos.example', host = 'growthos.example', forwardedHost = null }) {
  const calls = [];
  let committed = 0, rolled = 0, released = 0;
  const connection = {
    beginTransaction: async () => calls.push('BEGIN'),
    execute: async (sql) => {
      calls.push(sql);
      if (sql.startsWith('SELECT')) return [found ? [{ enabled }] : []];
      if (sql.startsWith('INSERT') && failInsert) throw Error('AUDIT_INSERT_FAILED');
      return [{ affectedRows: 1 }];
    },
    commit: async () => { committed++; },
    rollback: async () => { rolled++; },
    release: () => { released++; }
  };
  const mocks = {
    '../../../server/organization-context': {
      getAuthenticatedOrganizationContext: async () => ({ userId: 'user-1', organization: { id: 'org-1', role } })
    },
    '../../../server/request-security': helperModule.exports,
    '../../../server/mysql': { getMySQLPool: () => ({ getConnection: async () => connection }) },
    '../../../core/website-feature-controls': {
      canDisableWebsiteFeature: r => ['owner', 'admin'].includes(r),
      websiteFeaturePatchSchema: {
        safeParse: x => ({ success: x.enabled === false && ['automation', 'auto_publish'].includes(x.feature), data: x })
      }
    }
  };
  const module = { exports: {} };
  vm.runInNewContext(js, {
    module, exports: module.exports, Response, URL, Buffer,
    require: id => id === 'node:crypto' ? require(id) : (mocks[id] || (() => { throw Error('Missing mock ' + id); })())
  });
  const request = new Request('https://growthos.example/api/website-features', {
    method: 'PATCH',
    headers: new Headers({ origin, host, ...(forwardedHost ? { 'x-forwarded-host': forwardedHost } : {}), ...(declaredLength === null ? {} : { 'content-length': declaredLength }) }),
    body: body === null ? JSON.stringify({ websiteId: 'site-1', feature: 'automation', enabled: false }) : body
  });
  const response = await module.exports.PATCH(request);
  return { status: response.status, calls, committed, rolled, released };
}

(async () => {
  let r = await runCase({ enabled: 1 });
  assert.equal(r.status, 200);
  assert.equal(r.committed, 1);
  assert.equal(r.rolled, 0);
  assert.equal(r.released, 1);
  assert.equal(r.calls.filter(x => x.startsWith('INSERT')).length, 1);
  console.log('PASS enabled feature disabled and audited');

  r = await runCase({ enabled: 0 });
  assert.equal(r.status, 200);
  assert.equal(r.committed, 1);
  assert.equal(r.calls.filter(x => x.startsWith('INSERT')).length, 0);
  assert.equal(r.calls.filter(x => x.startsWith('UPDATE')).length, 0);
  console.log('PASS repeated disable is idempotent');

  r = await runCase({ found: false });
  assert.equal(r.status, 404);
  assert.equal(r.committed, 0);
  assert.equal(r.rolled, 1);
  console.log('PASS missing website rolls back');

  r = await runCase({ role: 'viewer' });
  assert.equal(r.status, 403);
  assert.equal(r.calls.length, 0);
  console.log('PASS viewer denied');

  r = await runCase({ failInsert: true });
  assert.equal(r.status, 503);
  assert.equal(r.committed, 0);
  assert.equal(r.rolled, 1);
  console.log('PASS audit failure rolls back');

  r = await runCase({ body: '{broken' });
  assert.equal(r.status, 400);
  assert.equal(r.calls.length, 0);
  console.log('PASS malformed JSON refused before DB access');

  r = await runCase({ body: 'x'.repeat(4097) });
  assert.equal(r.status, 413);
  assert.equal(r.calls.length, 0);
  console.log('PASS oversized actual body refused before DB access');

  r = await runCase({ declaredLength: '4097' });
  assert.equal(r.status, 413);
  assert.equal(r.calls.length, 0);
  console.log('PASS oversized declared body refused before DB access');

  r = await runCase({ declaredLength: '68' });
  assert.equal(r.status, 200);
  assert.equal(r.committed, 1);
  console.log('PASS ordinary numeric Content-Length accepted');

  for (const input of [
    { origin: 'https://evil.example', host: 'evil.example', forwardedHost: 'growthos.example' },
    { origin: 'https://growthos.example', host: 'evil.example' },
    { origin: 'https://evil.example', host: 'growthos.example' }
  ]) {
    r = await runCase(input);
    assert.equal(r.status, 403);
    assert.equal(r.calls.length, 0);
  }
  console.log('PASS forged Host/Origin combinations refused before DB access');
})().catch(error => { console.error(error); process.exitCode = 1; });
