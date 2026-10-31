import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import https from 'node:https';
import { EventEmitter } from 'node:events';
import { syncBuiltinESMExports } from 'node:module';
import { publicOwnershipIPv4, createOwnershipTransport, ownershipNetwork } from '../../server/bounded-ownership-fetch';
import { assertIsolatedWorkflowRuntime } from '../../server/isolated-workflow-runtime';
import { createAnalysisInput, analyzeManualEvidence, assertObservationTime, ownershipAction } from '../isolated-workflows';
import { createIsolatedWorkflowHandlers } from '../../server/isolated-workflows-http';
import type { MySQLIsolatedWorkflows } from '../../server/mysql-isolated-workflows';
const org = randomUUID(), website = randomUUID(), actor = randomUUID();
const evidence = { websiteId: website, pages: [{ url: 'https://owned.example.org/', status: 200, indexable: true, h1Count: 0, wordCount: 30, internalLinks: 0 }] };
const input = { organizationId: org, websiteId: website, requestKey: randomUUID(), sourceLabel: 'Manually inspected page',
  observedAt: new Date().toISOString(), runAfter: new Date().toISOString(), evidence };
process.env.GROWTHOS_APP_ORIGIN = 'https://growthos.example';
const request = (body: unknown, headers: Record<string,string> = {}) => new Request('https://growthos.example/api/isolated-workflows', { method: 'PATCH',
  headers: { origin: 'https://growthos.example', host: 'growthos.example', ...headers }, body: JSON.stringify(body) });

test('proposal runtime gate requires disposable opt-in, loopback, and explicit test schema', () => {
  const env = { GROWTHOS_SESSION02_DISPOSABLE: 'YES', GROWTHOS_TEST_DB_DISPOSABLE: 'YES', GROWTHOS_DB_HOST: '127.0.0.1', GROWTHOS_DB_NAME: 'growthos_test_unit' };
  assert.doesNotThrow(() => assertIsolatedWorkflowRuntime(env));
  for (const patch of [{ GROWTHOS_SESSION02_DISPOSABLE: '' }, { GROWTHOS_TEST_DB_DISPOSABLE: '' }, { GROWTHOS_DB_HOST: 'db.example.org' }, { GROWTHOS_DB_NAME: 'production' }])
    assert.throws(() => assertIsolatedWorkflowRuntime({ ...env, ...patch }), /ISOLATED_SCHEMA_REQUIRED/);
});
test('ownership address policy denies loopback, private, link-local, metadata, mapped IPv6, multicast, reserved and odd literals', () => {
  for (const address of ['127.0.0.1','10.1.2.3','172.16.0.1','172.31.1.2','192.168.1.1','169.254.169.254','100.64.0.1','0.0.0.0',
    '198.18.0.1','198.51.100.2','203.0.113.1','224.0.0.1','255.255.255.255','::1','::ffff:127.0.0.1','2001:4860::1','2130706433','0x7f000001','127.1']) assert.equal(publicOwnershipIPv4(address), false, address);
  assert.equal(publicOwnershipIPv4('8.8.8.8'), true); assert.equal(publicOwnershipIPv4('1.1.1.1'), true);
});
test('ownership destinations require exact host allowlist and no URL, path, port, credential, or internal alias', async () => {
  let calls = 0;
  const transport = createOwnershipTransport(['owned.example.org'], { resolve: async () => { calls++; return ['8.8.8.8']; }, readPinned: async () => 'proof' });
  for (const domain of ['localhost','127.0.0.1','https://owned.example.org','owned.example.org:443','user@owned.example.org','other.example.org','owned.example.org/path','owned.example.org.','OWNED.example.org']) await assert.rejects(transport.read(domain));
  assert.equal(calls, 0);
});
test('ownership refuses mixed public/private DNS answers before transport and pins the approved address', async () => {
  let reads = 0;
  const denied = createOwnershipTransport(['owned.example.org'], { resolve: async () => ['8.8.8.8','127.0.0.1'], readPinned: async () => { reads++; return ''; } });
  await assert.rejects(denied.read('owned.example.org'), /OWNERSHIP_ADDRESS_DENIED/); assert.equal(reads, 0);
  const pinned = createOwnershipTransport(['owned.example.org'], { resolve: async () => ['8.8.8.8'], readPinned: async (host, address, signal) => {
    assert.equal(host, 'owned.example.org'); assert.equal(address, '8.8.8.8'); assert.equal(signal.aborted, false); return 'proof';
  } });
  assert.equal(await pinned.read('owned.example.org'), 'proof');
});
test('ownership transport enforces result size even with an injected network adapter', async () => {
  const transport = createOwnershipTransport(['owned.example.org'], { resolve: async () => ['8.8.8.8'], readPinned: async () => 'x'.repeat(16385) });
  await assert.rejects(transport.read('owned.example.org'), /OWNERSHIP_RESPONSE_TOO_LARGE/);
});
test('manual analysis validates scope, time, records real supplied findings and never claims verified research', () => {
  assert.equal(createAnalysisInput.safeParse(input).success, true);
  const result = analyzeManualEvidence(input, 'owned.example.org');
  assert.equal(result.evidence, 'UNVERIFIED_MANUAL_INPUT'); assert.equal(result.externalRequests, 0); assert.equal(result.costMinor, '0');
  assert.ok(result.seoFindings.length); assert.ok(result.recommendations.length); assert.equal(result.competitors.length, 0);
  assert.throws(() => analyzeManualEvidence(input, 'other.example.org'), /EVIDENCE_SCOPE_MISMATCH/);
  assert.throws(() => assertObservationTime('2000-01-01T00:00:00Z', input.runAfter, Date.now()), /INVALID_OBSERVATION_TIME/);
  assert.equal(createAnalysisInput.safeParse({ ...input, evidence: { ...evidence, websiteId: randomUUID() } }).success, false);
  assert.equal(createAnalysisInput.safeParse({ ...input, executeLive: true }).success, false);
  assert.equal(ownershipAction.safeParse({ organizationId: org, websiteId: website, action: 'verify', challengeId: randomUUID(), token: 'short' }).success, false);
});
function harness(role = 'owner', runtime: () => void = () => {}) {
  let calls = 0;
  const store = { view: async () => { calls++; return { organizationId: org, websiteId: website }; }, issueOwnership: async () => { calls++; return { id: randomUUID() }; },
    createAnalysis: async () => { calls++; return { id: randomUUID(), duplicate: false }; }, action: async () => { calls++; throw Error('PRIVATE SQL SECRET'); } } as unknown as MySQLIsolatedWorkflows;
  return { calls: () => calls, ...createIsolatedWorkflowHandlers(async () => { if (role === 'anonymous') throw Error('AUTHENTICATION_REQUIRED'); return { userId: actor, organization: { id: org, role } }; }, () => store, runtime) };
}
test('disabled proposal API fails closed before authentication, pool creation or any data access', async () => {
  const api = harness('owner', () => { throw Error('ISOLATED_SCHEMA_REQUIRED'); });
  assert.equal((await api.GET(new Request('https://growthos.example/api/isolated-workflows'))).status, 501); assert.equal(api.calls(), 0);
});
test('workflow HTTP rejects anonymous, wrong tenant, viewer mutation, forged origin and oversized body', async () => {
  const body = { organizationId: org, websiteId: website, action: 'issue' };
  for (const [role,status] of [['anonymous',401],['viewer',403],['editor',403]] as const) {
    const api = harness(role); assert.equal((await api.PATCH(request(body))).status,status); assert.equal(api.calls(),0);
  }
  const api = harness();
  assert.equal((await api.PATCH(request({ ...body, organizationId: randomUUID() }))).status,403);
  assert.equal((await api.PATCH(request(body, { origin: 'https://evil.example' }))).status,403);
  assert.equal((await api.PATCH(request({ ...body, junk: 'x'.repeat(5000) }))).status,413); assert.equal(api.calls(),0);
  const response = await api.PATCH(request(body)); assert.equal(response.status,200); assert.equal(response.headers.get('cache-control'),'no-store'); assert.equal(api.calls(),1);
});
test('workflow GET refuses duplicate scope params and cross-tenant identity hints', async () => {
  const api = harness('viewer'), url = `https://growthos.example/api/isolated-workflows?organizationId=${org}&websiteId=${website}`;
  assert.equal((await api.GET(new Request(url + '&websiteId=' + website))).status,400);
  assert.equal((await api.GET(new Request(url.replace(org,randomUUID())))).status,403);
  assert.equal((await api.GET(new Request(url))).status,200);
});
test('analysis creation allows authenticated editor but does not grant execution or expose infrastructure errors', async () => {
  const api = harness('editor'); const response = await api.POST(request(input)); assert.equal(response.status,201); assert.equal((await response.json()).externalAction,false);
  const failed = await harness().PATCH(request({ organizationId: org, websiteId: website, jobId: randomUUID(), action: 'run' }));
  assert.equal(failed.status,503); assert.deepEqual(await failed.json(), { ok:false,code:'SERVICE_UNAVAILABLE' });
});


test('pinned HTTPS enforces IPv4, certificate validation, fixed path and bounded uncompressed non-redirect responses', async () => {
  const original = https.request;
  let status = 200, encoding: string | undefined, chunks: Buffer[] = [Buffer.from('proof')];
  https.request = ((options: Record<string,any>, callback: (response: any) => void) => {
    assert.equal(options.hostname, 'owned.example.org'); assert.equal(options.servername, 'owned.example.org');
    assert.equal(options.family, 4); assert.equal(options.rejectUnauthorized, true); assert.equal(options.agent, false);
    assert.equal(options.port, 443); assert.equal(options.path, '/.well-known/growthos-verification.txt');
    options.lookup('owned.example.org', {}, (error: unknown, address: string, family: number) => { assert.equal(error,null); assert.equal(address,'8.8.8.8'); assert.equal(family,4); });
    const req = new EventEmitter() as EventEmitter & { end: () => void };
    req.end = () => {
      const response = new EventEmitter() as EventEmitter & { headers: object; statusCode: number; destroyed: boolean; destroy: (error?:Error) => void };
      response.headers = encoding ? { 'content-encoding': encoding } : {}; response.statusCode = status; response.destroyed = false;
      response.destroy = error => { response.destroyed = true; if(error)response.emit('error',error); };
      callback(response);
      process.nextTick(() => { for(const chunk of chunks){if(response.destroyed)return;response.emit('data',chunk);}if(!response.destroyed)response.emit('end'); });
    };
    return req;
  }) as unknown as typeof https.request;
  syncBuiltinESMExports();
  try {
    assert.equal(await ownershipNetwork.readPinned('owned.example.org','8.8.8.8',new AbortController().signal),'proof');
    status = 302; await assert.rejects(ownershipNetwork.readPinned('owned.example.org','8.8.8.8',new AbortController().signal), /OWNERSHIP_RESPONSE_DENIED/);
    status = 200; encoding = 'gzip'; await assert.rejects(ownershipNetwork.readPinned('owned.example.org','8.8.8.8',new AbortController().signal), /OWNERSHIP_RESPONSE_DENIED/);
    encoding = undefined; chunks = [Buffer.alloc(16385)]; await assert.rejects(ownershipNetwork.readPinned('owned.example.org','8.8.8.8',new AbortController().signal), /OWNERSHIP_RESPONSE_TOO_LARGE/);
    chunks = [Buffer.from([0xff])]; await assert.rejects(ownershipNetwork.readPinned('owned.example.org','8.8.8.8',new AbortController().signal), /OWNERSHIP_RESPONSE_DENIED/);
  } finally { https.request = original; syncBuiltinESMExports(); }
});

test('default ownership transport does not bypass an inherited HTTPS proxy', async () => {
  const previous = process.env.HTTPS_PROXY; process.env.HTTPS_PROXY = 'http://proxy.example.invalid:8080';
  try { await assert.rejects(createOwnershipTransport(['owned.example.org']).read('owned.example.org'), /OWNERSHIP_PROXY_TRANSPORT_UNAVAILABLE/); }
  finally { if(previous === undefined) delete process.env.HTTPS_PROXY; else process.env.HTTPS_PROXY=previous; }
});
