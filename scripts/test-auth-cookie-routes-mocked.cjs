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
    module, exports: module.exports, Response, URL, Buffer, TextDecoder, process,
    require: id => {
      if (!(id in mocks)) throw Error('Unmocked dependency: ' + id);
      return mocks[id];
    }
  });
  return module.exports;
};
process.env.GROWTHOS_APP_ORIGIN = 'https://growthos.example';
const requestSecurity = transpile('src/server/request-security.ts', {});
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
    '../../../../server/organization-context': { ORGANIZATION_COOKIE_NAME: organizationCookie },
    '../../../../server/request-security': requestSecurity
  });
  let result = await login.POST(new Request('https://growthos.example/api/auth/login', { method: 'POST', headers: originHeaders, body: JSON.stringify({ email: 'test@example.invalid', password: 'synthetic' }) }));
  assert.equal(result.status, 200);
  const loginCookies = result.headers.get('set-cookie') || '';
  assert.match(loginCookies, /growthos_session=synthetic-token/);
  assert.match(loginCookies, /HttpOnly/i);
  assert.match(loginCookies, /Secure/i);
  assert.match(loginCookies, /SameSite=Lax/i);
  assert.match(loginCookies, /growthos_organization=;[^,]*Max-Age=0/i);
  console.log('PASS login sets secure session and clears organization cookie');

  result = await login.POST(new Request('https://growthos.example/api/auth/login', { method: 'POST', headers: { origin: 'https://evil.example', host: 'growthos.example' }, body: '{}' }));
  assert.equal(result.status, 403);
  assert.equal(loginCount, 1);
  console.log('PASS cross-origin login refused before authentication');

  result = await login.POST(new Request('https://growthos.example/api/auth/login', { method: 'POST', headers: originHeaders, body: '{}' }));
  assert.equal(result.status, 401);
  assert.equal(result.headers.get('cache-control'), 'no-store');
  assert.equal(loginCount, 1);
  console.log('PASS malformed login credentials are not cached or authenticated');

  result = await login.POST(new Request('https://growthos.example/api/auth/login', { method: 'POST', headers: originHeaders, body: '{invalid' }));
  assert.equal(result.status, 400);
  assert.equal(result.headers.get('cache-control'), 'no-store');
  assert.equal(loginCount, 1);
  console.log('PASS malformed JSON is non-cacheable and refused before authentication');

  result = await login.POST(new Request('https://growthos.example/api/auth/login', { method: 'POST', headers: originHeaders, body: 'x'.repeat(4097) }));
  assert.equal(result.status, 413);
  assert.equal(result.headers.get('cache-control'), 'no-store');
  assert.equal(loginCount, 1);
  console.log('PASS oversized login body is non-cacheable and refused before authentication');

  let membershipChecks = 0;
  const organizationContext = transpile('src/server/organization-context.ts', {
    './mysql-session': { verifyMySQLSession: async token => token === 'synthetic-token' ? 'user-a' : null },
    './mysql-organizations': {
      listAccessibleOrganizations: async () => [{ id: 'org-a', name: 'Synthetic A', role: 'owner' }],
      requireOrganizationChoice: async (userId, organizationId) => {
        membershipChecks++;
        if (userId !== 'user-a' || organizationId !== 'org-a') throw Error('ORGANIZATION_FORBIDDEN');
        return { id: 'org-a', name: 'Synthetic A', role: 'owner' };
      }
    },
    './authenticated-website-access': { SESSION_COOKIE_NAME: cookieName }
  });
  const requestWithCookies = cookies => new Request('https://growthos.example/api/organizations', {
    headers: { cookie: cookies }
  });
  await assert.rejects(() => organizationContext.getAuthenticatedOrganizationContext(requestWithCookies('')), /AUTHENTICATION_REQUIRED/);
  await assert.rejects(() => organizationContext.getAuthenticatedOrganizationContext(requestWithCookies('growthos_session=synthetic-token')), /ORGANIZATION_REQUIRED/);
  await assert.rejects(() => organizationContext.getAuthenticatedOrganizationContext(requestWithCookies('growthos_session=synthetic-token; growthos_organization=org-b')), /ORGANIZATION_FORBIDDEN/);
  const scoped = await organizationContext.getAuthenticatedOrganizationContext(requestWithCookies('growthos_session=synthetic-token; growthos_organization=org-a'));
  assert.equal(scoped.organization.id, 'org-a');
  assert.equal(membershipChecks, 2);
  console.log('PASS organization context requires session, explicit choice, and verified membership');

  const deleted = [];
  const revoked = [];
  const logout = transpile('src/app/api/auth/logout/route.ts', {
    'next/headers': { cookies: async () => ({
      get: key => key === cookieName ? { value: 'synthetic-token' } : undefined,
      delete: key => deleted.push(key)
    }) },
    '../../../../server/mysql-session': { revokeMySQLSession: async token => revoked.push(token) },
    '../../../../server/authenticated-website-access': { SESSION_COOKIE_NAME: cookieName },
    '../../../../server/organization-context': { ORGANIZATION_COOKIE_NAME: organizationCookie },
    '../../../../server/request-security': requestSecurity
  });
  result = await logout.POST({ headers: originHeaders });
  assert.equal(result.status, 200);
  assert.deepEqual(revoked, ['synthetic-token']);
  assert.deepEqual(deleted, [cookieName, organizationCookie]);
  console.log('PASS logout revokes session and clears both cookies');
  const failingLogout = transpile('src/app/api/auth/logout/route.ts', {
    'next/headers': { cookies: async () => { throw Error('SYNTHETIC_COOKIE_STORE_FAILURE'); } },
    '../../../../server/mysql-session': { revokeMySQLSession: async () => { throw Error('SHOULD_NOT_RUN'); } },
    '../../../../server/authenticated-website-access': { SESSION_COOKIE_NAME: cookieName },
    '../../../../server/organization-context': { ORGANIZATION_COOKIE_NAME: organizationCookie },
    '../../../../server/request-security': requestSecurity
  });
  result = await failingLogout.POST({ headers: originHeaders });
  assert.equal(result.status, 503);
  assert.equal(result.headers.get('cache-control'), 'no-store');
  assert.equal((await result.json()).code, 'SERVICE_UNAVAILABLE');
  console.log('PASS logout service failure is generic and non-cacheable');
  result = await logout.POST({ headers: new Headers({ origin: 'https://evil.example', host: 'growthos.example' }) });
  assert.equal(result.status, 403);
  assert.equal(revoked.length, 1);
  console.log('PASS cross-origin logout refused before revocation');
  result = await logout.POST({ headers: new Headers({ origin: 'https://growthos.example', host: 'evil.example', 'x-forwarded-host': 'growthos.example' }) });
  assert.equal(result.status, 403);
  assert.equal(revoked.length, 1);
  console.log('PASS forged Host logout refused before revocation');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
