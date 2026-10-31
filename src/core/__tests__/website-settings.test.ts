import test from 'node:test';
import assert from 'node:assert/strict';
import type { Pool, PoolConnection } from 'mysql2/promise';
import { websiteSettingsPatchSchema, assertWebsiteSettingsChange, readWebsiteSettingsResponse, type WebsiteSettings, type WebsiteSettingsPatch } from '../website-settings';
import { createWebsiteSettingsHandlers } from '../../server/website-settings-http';
import { createMySQLWebsiteSettingsStore, type WebsiteSettingsStore } from '../../server/mysql-website-settings';

const org = '00000000-0000-4000-8000-000000000001';
const other = '00000000-0000-4000-8000-000000000002';
const id = '00000000-0000-4000-8000-000000000003';
const actor = '00000000-0000-4000-8000-000000000004';
const site: WebsiteSettings = { id, domain: 'example.test', platform: 'custom', status: 'draft', timezone: 'UTC',
  verifiedAt: null, automationEnabled: false, autoPublishEnabled: false, monthlyBudgetMinor: '0', stateToken: 'a'.repeat(64) };
const metadata = { organizationId: org, websiteId: id, expectedState: site.stateToken, action: 'metadata', platform: 'static', timezone: 'Europe/London' } as const;
const lifecycle = { organizationId: org, websiteId: id, expectedState: site.stateToken, action: 'lifecycle', status: 'paused' } as const;
const request = (body: unknown, headers: Record<string, string> = {}) => new Request('https://growthos.example/api/website-settings', {
  method: 'PATCH', headers: { origin: 'https://growthos.example', host: 'growthos.example', ...headers }, body: JSON.stringify(body)
});
process.env.GROWTHOS_APP_ORIGIN = 'https://growthos.example';

function harness(role = 'owner', failure?: string) {
  const calls: unknown[][] = [];
  const store: WebsiteSettingsStore = {
    read: async (...args) => { calls.push(['read', ...args]); return site; },
    update: async (...args) => { calls.push(['update', ...args]); if (failure) throw Error(failure); return site; },
    history: async (...args) => { calls.push(['history', ...args]); return { items: [], next: { at: '2026-10-31 01:02:03', id: actor } }; }
  };
  const handlers = createWebsiteSettingsHandlers(async () => {
    if (role === 'anonymous') throw Error('AUTHENTICATION_REQUIRED');
    return { userId: actor, organization: { id: org, role } };
  }, () => store);
  return { ...handlers, calls };
}

test('settings validation refuses activation, authority fields, invalid timezone, and malformed scope', () => {
  assert.equal(websiteSettingsPatchSchema.safeParse(metadata).success, true);
  for (const input of [ { ...metadata, timezone: 'Not/AZone' }, { ...metadata, timezone: ' UTC' },
    { ...metadata, websiteId: 'bad' }, { ...metadata, automationEnabled: true }, { ...metadata, domain: 'changed.test' },
    { ...lifecycle, status: 'active' }, { ...lifecycle, status: 'connected' }, { ...metadata, expectedState: '' } ]) {
    assert.equal(websiteSettingsPatchSchema.safeParse(input).success, false);
  }
});

test('metadata is restricted to unverified drafts and lifecycle cannot resume archived sites', () => {
  assert.doesNotThrow(() => assertWebsiteSettingsChange(site, metadata));
  for (const status of ['paused', 'active', 'connected', 'archived']) assert.throws(() => assertWebsiteSettingsChange({ ...site, status }, metadata), /METADATA_LOCKED/);
  assert.throws(() => assertWebsiteSettingsChange({ ...site, verifiedAt: '2026-01-01T00:00:00Z' }, metadata), /METADATA_LOCKED/);
  assert.throws(() => assertWebsiteSettingsChange({ ...site, status: 'active' }, { ...lifecycle, status: 'draft' }), /INVALID_TRANSITION/);
  assert.throws(() => assertWebsiteSettingsChange({ ...site, status: 'archived' }, lifecycle), /INVALID_TRANSITION/);
  assert.doesNotThrow(() => assertWebsiteSettingsChange({ ...site, status: 'archived' }, { ...lifecycle, status: 'draft' }));
});

test('HTTP mutations require authenticated owner/admin, canonical origin, bounded input, and current organization', async () => {
  for (const [role, status] of [['anonymous', 401], ['viewer', 403], ['editor', 403]] as const) {
    const api = harness(role); const response = await api.PATCH(request(metadata));
    assert.equal(response.status, status); assert.equal(response.headers.get('cache-control'), 'no-store'); assert.equal(api.calls.length, 0);
  }
  const api = harness();
  for (const headers of [{ origin: 'https://evil.test' }, { host: 'evil.test', 'x-forwarded-host': 'growthos.example' }] as Record<string, string>[]) assert.equal((await api.PATCH(request(metadata, headers))).status, 403);
  assert.equal((await api.PATCH(request({ ...metadata, organizationId: other }))).status, 403);
  assert.equal((await api.PATCH(request({ ...metadata, timezone: 'x'.repeat(5000) }))).status, 413);
  assert.equal((await api.PATCH(request({ ...metadata, status: 'active' }))).status, 400);
  assert.equal(api.calls.length, 0);
  for (const role of ['owner', 'admin']) {
    const allowed = harness(role); const response = await allowed.PATCH(request(metadata));
    assert.equal(response.status, 200); assert.equal(allowed.calls[0][1], org); assert.equal(allowed.calls[0][2], actor);
  }
});

test('HTTP errors distinguish conflict/not found and do not expose database details', async () => {
  for (const [error, status, code] of [['SETTINGS_CONFLICT', 409, 'SETTINGS_CONFLICT'], ['METADATA_LOCKED', 409, 'METADATA_LOCKED'],
    ['WEBSITE_NOT_FOUND', 404, 'WEBSITE_NOT_FOUND'], ['SQL password=secret', 503, 'SERVICE_UNAVAILABLE']] as const) {
    const response = await harness('owner', error).PATCH(request(lifecycle));
    assert.equal(response.status, status); assert.deepEqual(await response.json(), { ok: false, code });
    assert.equal(response.headers.get('cache-control'), 'no-store');
  }
});

test('history GET is available to viewers, validates scope and binds pagination to website and organization', async () => {
  const api = harness('viewer');
  const url = `https://growthos.example/api/website-settings?organizationId=${org}&websiteId=${id}`;
  const response = await api.GET(new Request(url)); assert.equal(response.status, 200);
  const body = await response.json(); assert.ok(body.nextCursor);
  assert.equal((await api.GET(new Request(url + '&cursor=' + body.nextCursor))).status, 200);
  assert.deepEqual(api.calls.at(-1), ['history', org, id, { at: '2026-10-31 01:02:03', id: actor }]);
  for (const query of [url + '&cursor=!', url + '&websiteId=' + id, url + '&unexpected=1',
    url.replace(id, actor) + '&cursor=' + body.nextCursor]) assert.equal((await api.GET(new Request(query))).status, 400);
  const before = api.calls.length;
  assert.equal((await api.GET(new Request(url.replace(org, other)))).status, 403); assert.equal(api.calls.length, before);
  assert.equal((await harness('anonymous').GET(new Request(url))).status, 401);
});

test('client response parsing refuses cross-tenant/site and untyped flags', () => {
  const response = { ok: true, organizationId: org, website: site };
  assert.deepEqual(readWebsiteSettingsResponse(response, org, id), site);
  assert.throws(() => readWebsiteSettingsResponse(response, other, id));
  assert.throws(() => readWebsiteSettingsResponse(response, org, actor));
  assert.throws(() => readWebsiteSettingsResponse({ ...response, website: { ...site, automationEnabled: '0' } }, org, id));
});

function sqlHarness(options: { auditFailure?: boolean; missing?: boolean } = {}) {
  let row = { id, domain: 'example.test', platform: 'custom', status: 'draft', timezone: 'UTC', verified_at: null, automation_enabled: '1', auto_publish_enabled: 1, monthly_budget_minor: '0' };
  let original = { ...row }; const calls: { sql: string; params?: unknown[] }[] = [];
  const execute = async (sql: string, params: unknown[]) => {
    calls.push({ sql, params });
    if (sql.startsWith('SELECT')) return [options.missing ? [] : [{ ...row }]];
    if (sql.startsWith('INSERT') && options.auditFailure) throw Error('AUDIT_FAILED');
    if (sql.includes('SET platform')) row = { ...row, platform: params[0] as string, timezone: params[1] as string };
    if (sql.includes('SET status')) row = { ...row, status: params[0] as string, automation_enabled: '0', auto_publish_enabled: 0 };
    return [{ affectedRows: 1 }];
  };
  const connection = { execute, beginTransaction: async () => { original = { ...row }; calls.push({ sql: 'BEGIN' }); },
    commit: async () => { calls.push({ sql: 'COMMIT' }); }, rollback: async () => { row = original; calls.push({ sql: 'ROLLBACK' }); }, release: () => { calls.push({ sql: 'RELEASE' }); } } as unknown as PoolConnection;
  const store = createMySQLWebsiteSettingsStore({ execute, getConnection: async () => connection } as unknown as Pool);
  return { store, calls, row: () => row };
}

test('SQL store locks tenant row, atomically shuts down both switches and appends events', async () => {
  const h = sqlHarness(); const before = await h.store.read(org, id);
  const after = await h.store.update(org, actor, { ...lifecycle, expectedState: before.stateToken });
  assert.equal(after.status, 'paused'); assert.equal(after.automationEnabled, false); assert.equal(after.autoPublishEnabled, false);
  assert.notEqual(after.stateToken, before.stateToken);
  assert.ok(h.calls.some(call => call.sql.endsWith('FOR UPDATE')));
  const inserts = h.calls.filter(call => call.sql.startsWith('INSERT'));
  assert.equal(inserts.length, 2); assert.deepEqual(inserts.map(call => call.params?.slice(1, 4)), [[org, id, actor], [org, id, actor]]);
  assert.deepEqual(h.calls.slice(-2).map(call => call.sql), ['COMMIT', 'RELEASE']);
  for (const query of h.calls.filter(call => /^(SELECT|UPDATE)/.test(call.sql))) assert.ok(query.sql.includes('organization_id=? AND id=?'));
});

test('SQL store rolls back feature state when immutable event insertion fails', async () => {
  const h = sqlHarness({ auditFailure: true }); const before = await h.store.read(org, id);
  await assert.rejects(h.store.update(org, actor, { ...lifecycle, expectedState: before.stateToken }), /AUDIT_FAILED/);
  assert.equal(h.row().status, 'draft'); assert.equal(h.row().automation_enabled, '1');
  assert.deepEqual(h.calls.slice(-2).map(call => call.sql), ['ROLLBACK', 'RELEASE']);
  assert.equal(h.calls.some(call => call.sql === 'COMMIT'), false);
});

test('SQL store refuses stale state and missing websites without issuing mutations', async () => {
  const h = sqlHarness();
  await assert.rejects(h.store.update(org, actor, lifecycle), /SETTINGS_CONFLICT/);
  assert.equal(h.calls.some(call => /^(INSERT|UPDATE)/.test(call.sql)), false);
  await assert.rejects(sqlHarness({ missing: true }).store.update(org, actor, lifecycle), /WEBSITE_NOT_FOUND/);
});

test('metadata persists without changing status, verification, feature switches, budget, or domain', async () => {
  const h = sqlHarness(); const before = await h.store.read(org, id);
  const after = await h.store.update(org, actor, { ...metadata, expectedState: before.stateToken });
  assert.equal(after.platform, 'static'); assert.equal(after.timezone, 'Europe/London');
  assert.equal(after.domain, before.domain); assert.equal(after.status, before.status);
  assert.equal(after.verifiedAt, before.verifiedAt); assert.equal(after.monthlyBudgetMinor, before.monthlyBudgetMinor);
  assert.equal(after.automationEnabled, before.automationEnabled); assert.equal(after.autoPublishEnabled, before.autoPublishEnabled);
  assert.equal(h.calls.filter(call => call.sql.startsWith('INSERT')).length, 0);
});
