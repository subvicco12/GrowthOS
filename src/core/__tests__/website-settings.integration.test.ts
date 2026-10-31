import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { RowDataPacket } from 'mysql2/promise';
import { getMySQLPool } from '../../server/mysql';
import { issueMySQLSession } from '../../server/mysql-session';
import { GET, PATCH } from '../../app/api/website-settings/route';
import { createMySQLWebsiteSettingsStore } from '../../server/mysql-website-settings';

const enabled = process.env.GROWTHOS_TEST_DB_DISPOSABLE === 'YES' &&
  /^growthos_test_[a-zA-Z0-9_]+$/.test(process.env.GROWTHOS_DB_NAME ?? '') &&
  ['127.0.0.1', 'localhost', '::1'].includes(process.env.GROWTHOS_DB_HOST ?? '');
const integration = enabled ? test : test.skip;
if (enabled) after(async () => { await getMySQLPool().end(); });

integration('real session, tenant isolation, durable settings, concurrent stop, rollback, history pagination and immutability', async () => {
  process.env.GROWTHOS_APP_ORIGIN = 'https://growthos.example';
  const db = getMySQLPool(), store = createMySQLWebsiteSettingsStore(db);
  const org = randomUUID(), other = randomUUID(), actor = randomUUID(), viewer = randomUUID(), site = randomUUID(), otherSite = randomUUID();
  await db.execute('INSERT INTO growth_organizations(id,name) VALUES (?,?),(?,?)', [org, 'Settings test', other, 'Other tenant']);
  for (const user of [actor, viewer]) await db.execute('INSERT INTO growth_users(id,email,password_hash,disabled) VALUES (?,?,?,FALSE)', [user, user + '@example.invalid', 'disabled-test-password']);
  await db.execute("INSERT INTO growth_memberships(organization_id,user_id,role) VALUES (?,?,'owner'),(?,?,'viewer')", [org, actor, org, viewer]);
  for (const [organization, website] of [[org, site], [other, otherSite]])
    await db.execute("INSERT INTO growth_websites(id,organization_id,domain,platform) VALUES (?,?,?,'custom')", [website, organization, website + '.example.invalid']);
  const session = await issueMySQLSession(actor), viewerSession = await issueMySQLSession(viewer);
  const request = (method: string, body?: unknown, token = session.token, website = site, query = '') => new Request(
    `https://growthos.example/api/website-settings?organizationId=${org}&websiteId=${website}${query}`, {
      method, headers: { origin: 'https://growthos.example', host: 'growthos.example', cookie: `growthos_session=${token}; growthos_organization=${org}` },
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    });
  assert.equal((await GET(new Request(`https://growthos.example/api/website-settings?organizationId=${org}&websiteId=${site}`))).status, 401);
  assert.equal((await GET(request('GET', undefined, session.token, otherSite))).status, 404);
  const first = await GET(request('GET')); assert.equal(first.status, 200);
  const before = (await first.json()).website;
  const metadata = { organizationId: org, websiteId: site, expectedState: before.stateToken, action: 'metadata', platform: 'static', timezone: 'Europe/London' };
  assert.equal((await PATCH(request('PATCH', metadata, viewerSession.token))).status, 403);
  assert.equal((await PATCH(request('PATCH', { ...metadata, organizationId: other }))).status, 403);
  const saved = await PATCH(request('PATCH', metadata)); assert.equal(saved.status, 200);
  const reloaded = (await (await GET(request('GET'))).json()).website;
  assert.equal(reloaded.platform, 'static'); assert.equal(reloaded.timezone, 'Europe/London'); assert.equal(reloaded.status, 'draft');
  assert.equal(reloaded.automationEnabled, false); assert.equal(reloaded.autoPublishEnabled, false);
  assert.equal((await PATCH(request('PATCH', metadata))).status, 409);

  // Synthetic pre-existing active switches exercise shutdown, never live automation.
  await db.execute("UPDATE growth_websites SET status='active',verified_at=UTC_TIMESTAMP(),automation_enabled=TRUE,auto_publish_enabled=TRUE WHERE organization_id=? AND id=?", [org, site]);
  const active = await store.read(org, site);
  const lifecycle = { organizationId: org, websiteId: site, expectedState: active.stateToken, action: 'lifecycle' as const, status: 'paused' as const };
  // A missing audit actor forces the real FK to reject insertion after the UPDATE; both switches and status must roll back.
  await assert.rejects(store.update(org, randomUUID(), lifecycle));
  const rolledBack = await store.read(org, site);
  assert.equal(rolledBack.stateToken, active.stateToken);
  const competing = await Promise.all([PATCH(request('PATCH', lifecycle)), PATCH(request('PATCH', { ...lifecycle, status: 'archived' }))]);
  assert.deepEqual(competing.map(r => r.status).sort(), [200, 409]);
  const stopped = await store.read(org, site);
  assert.equal(stopped.automationEnabled, false); assert.equal(stopped.autoPublishEnabled, false);
  const [events] = await db.execute<RowDataPacket[]>('SELECT id,feature FROM growth_website_feature_audit WHERE organization_id=? AND website_id=?', [org, site]);
  assert.equal(events.length, 2);
  await assert.rejects(db.execute('UPDATE growth_website_feature_audit SET feature=? WHERE id=?', ['automation', events[0].id]));
  await assert.rejects(db.execute('DELETE FROM growth_website_feature_audit WHERE id=?', [events[0].id]));
  assert.equal((await PATCH(request('PATCH', { ...metadata, expectedState: stopped.stateToken }))).status, 409);
  assert.equal((await PATCH(request('PATCH', { ...lifecycle, expectedState: stopped.stateToken, status: 'active' }))).status, 400);

  // Same-second events test stable (timestamp,id) pagination and no duplicate/omitted events.
  for (let i = 0; i < 28; i++) await db.execute('INSERT INTO growth_website_feature_audit(id,organization_id,website_id,actor_id,feature,enabled) VALUES (?,?,?,?,?,FALSE)', [randomUUID(), org, site, actor, 'automation']);
  const page = await (await GET(request('GET', undefined, viewerSession.token))).json();
  assert.equal(page.history.length, 25); assert.ok(page.nextCursor);
  const older = await (await GET(request('GET', undefined, viewerSession.token, site, '&cursor=' + page.nextCursor))).json();
  assert.equal(older.history.length, 5); assert.equal(older.nextCursor, null);
  assert.equal(new Set([...page.history, ...older.history].map(e => e.id)).size, 30);
  assert.equal((await GET(request('GET', undefined, session.token, otherSite, '&cursor=' + page.nextCursor))).status, 400);
  assert.equal((await PATCH(request('PATCH', { ...lifecycle, expectedState: stopped.stateToken, status: 'draft' }))).status, 200);
  const draft = await store.read(org, site);
  assert.equal(draft.status, 'draft'); assert.equal(draft.automationEnabled, false); assert.equal(draft.autoPublishEnabled, false);
  // Restoring a verified site never unlocks identity/connector metadata editing.
  assert.equal((await PATCH(request('PATCH', { ...metadata, expectedState: draft.stateToken }))).status, 409);
});
