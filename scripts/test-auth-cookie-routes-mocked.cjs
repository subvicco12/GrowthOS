// Offline route-level tests: mocks all dependencies; no DB, network or production access.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const transpile = (relative, mocks) => {
  const source = fs.readFileSync(path.join(root, relative), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(compiled, {
    module, exports: module.exports, Response, URL, Buffer,
    require: id => {
      if (!(id in mocks)) throw Error('Unmocked dependency: ' + id);
      return mocks[id];
    }
  });
  return module.exports;
};
const originHeaders = new Headers({ origin: 'https://growthos.example', host: 'growthos.example' });
const cookieName = 'growthos_session';
const organizationCookie = 'growthos_organization';

async function run() {
  let loginCount = 0;
  const login = transpile('src/app/api/auth/login/route.ts', {
    zod: {
      z: {
        object: () => ({ strict: () => ({ safeParse: body => ({
          success: typeof body?.email === 'string' && typeof body?.password === 'string',
          data: body
        }) }) }),
        string: () => ({ email() { return this; }, max() { return this; }, min() { return this; } })
      }
    },
    '../../../../server/mysql-login': { loginWithPassword: async () => {
      loginCount++;
      return { token: 'synthetic-token', expiresAt: new Date('2030-01-01T00:00:00Z') };
    } },
    '../../../../server/authenticated-website-access': { SESSION_COOKIE_NAME: cookieName },
    '../../../../server/organization-context': { ORGANIZATION_COOKIE_NAME: organizationCookie }
  });
  let result = await login.POST({ headers: originHeaders, json: async () => ({ email: 'test@example.invalid', password: 'synthetic' }) });
  assert.equal(result.status, 200);
  const loginCookies = result.headers.get('set-cookie') || '';
  assert.match(loginCookies, /growthos_session=synthetic-token/);
  assert.match(loginCookies, /HttpOnly/i);
  assert.match(loginCookies, /Secure/i);
  assert.match(loginCookies, /SameSite=Lax/i);
  assert.match(loginCookies, /growthos_organization=;[^,]*Max-Age=0/i);
  console.log('PASS login sets secure session and clears organization cookie');

  result = await login.POST({ headers: new Headers({ origin: 'https://evil.example', host: 'growthos.example' }), json: async () => ({ email: 'test@example.invalid', password: 'synthetic' }) });
  assert.equal(result.status, 403);
  assert.equal(loginCount, 1);
  console.log('PASS cross-origin login refused before authentication');

  const deleted = [];
  const revoked = [];
  const logout = transpile('src/app/api/auth/logout/route.ts', {
    'next/headers': { cookies: async () => ({
      get: key => key === cookieName ? { value: 'synthetic-token' } : undefined,
      delete: key => deleted.push(key)
    }) },
    '../../../../server/mysql-session': { revokeMySQLSession: async token => revoked.push(token) },
    '../../../../server/authenticated-website-access': { SESSION_COOKIE_NAME: cookieName },
    '../../../../server/organization-context': { ORGANIZATION_COOKIE_NAME: organizationCookie }
  });
  result = await logout.POST({ headers: originHeaders });
  assert.equal(result.status, 200);
  assert.deepEqual(revoked, ['synthetic-token']);
  assert.deepEqual(deleted, [cookieName, organizationCookie]);
  console.log('PASS logout revokes session and clears both cookies');
  result = await logout.POST({ headers: new Headers({ origin: 'https://evil.example', host: 'growthos.example' }) });
  assert.equal(result.status, 403);
  assert.equal(revoked.length, 1);
  console.log('PASS cross-origin logout refused before revocation');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
