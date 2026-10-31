#!/usr/bin/env node
// Run only against a local HTTPS app and disposable approved baseline schema.
const assert = require('node:assert/strict');
const { randomUUID, randomBytes, createHash } = require('node:crypto');
const base = new URL(process.env.GROWTHOS_E2E_BASE_URL || 'https://localhost:33319');
if (process.env.GROWTHOS_TEST_DB_DISPOSABLE !== 'YES' ||
    !/^growthos_test_[a-zA-Z0-9_]+$/.test(process.env.GROWTHOS_DB_NAME || '') ||
    !['127.0.0.1', 'localhost', '::1'].includes(process.env.GROWTHOS_DB_HOST || '') ||
    !['127.0.0.1', 'localhost', '[::1]'].includes(base.hostname) || base.protocol !== 'https:' || base.username || base.password) {
  console.error('REFUSED: browser tests require disposable local DB and local HTTPS app.'); process.exit(2);
}
(async () => {
  const { chromium } = require(process.env.GROWTHOS_PLAYWRIGHT_MODULE || 'playwright');
  const pool = require('mysql2/promise').createPool({ host: process.env.GROWTHOS_DB_HOST, port: Number(process.env.GROWTHOS_DB_PORT || 3306),
    user: process.env.GROWTHOS_DB_USER, password: process.env.GROWTHOS_DB_PASSWORD, database: process.env.GROWTHOS_DB_NAME });
  let browser;
  try {
    const org = randomUUID(), site = randomUUID(), tokens = [];
    await pool.execute('INSERT INTO growth_organizations(id,name) VALUES (?,?)', [org, 'Browser settings test']);
    await pool.execute("INSERT INTO growth_websites(id,organization_id,domain,platform) VALUES (?,?,?,'custom')", [site, org, site + '.example.invalid']);
    for (const role of ['owner', 'viewer']) {
      const user = randomUUID(), token = randomBytes(32).toString('base64url'); tokens.push(token);
      await pool.execute('INSERT INTO growth_users(id,email,password_hash,disabled) VALUES (?,?,?,FALSE)', [user, user + '@example.invalid', 'test-only-no-login']);
      await pool.execute('INSERT INTO growth_memberships(organization_id,user_id,role) VALUES (?,?,?)', [org, user, role]);
      await pool.execute('INSERT INTO growth_sessions(id,user_id,token_hash,expires_at) VALUES (?,?,?,DATE_ADD(UTC_TIMESTAMP(), INTERVAL 1 HOUR))', [randomUUID(), user, createHash('sha256').update(token).digest('hex')]);
    }
    browser = await chromium.launch({ executablePath: process.env.GROWTHOS_CHROMIUM_PATH || undefined, headless: true, args: ['--no-sandbox'] });
    const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1280, height: 900 } });
    await context.route('**/*', route => new URL(route.request().url()).origin === base.origin ? route.continue() : route.abort());
    async function cookies(token) {
      await context.clearCookies();
      await context.addCookies([{ name: 'growthos_session', value: token, url: base.origin, secure: true, httpOnly: true, sameSite: 'Lax' },
        { name: 'growthos_organization', value: org, url: base.origin, secure: true, httpOnly: true, sameSite: 'Lax' }]);
    }
    await cookies(tokens[0]); const page = await context.newPage(); page.on('dialog', d => d.accept());
    await page.goto(base.origin + '/#websites');
    await page.getByRole('button', { name: 'View settings', exact: true }).click();
    const input = page.getByLabel('IANA timezone', { exact: true }); await input.waitFor();
    await page.getByLabel('Website platform', { exact: true }).selectOption('static'); await input.fill('America/New_York');
    async function mutate(label, expected = 200) {
      const response = page.waitForResponse(r => r.url().endsWith('/api/website-settings') && r.request().method() === 'PATCH');
      await page.getByRole('button', { name: label, exact: true }).click(); assert.equal((await response).status(), expected);
    }
    await mutate('Save configuration'); await page.reload();
    await page.getByRole('button', { name: 'View settings', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('input[id^="settings-timezone-"]')?.value === 'America/New_York');
    console.log('PASS browser: configuration persists after full reload');
    await pool.execute('UPDATE growth_websites SET timezone=? WHERE organization_id=? AND id=?', ['UTC', org, site]);
    await mutate('Save configuration', 409);
    await page.getByText('Settings changed or this transition is no longer allowed. Reload settings before trying again.', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Reload settings and history' }).click();
    await page.waitForFunction(() => document.querySelector('input[id^="settings-timezone-"]')?.value === 'UTC');
    console.log('PASS browser: stale edit refusal and reload recovery');
    for (const label of ['Pause website', 'Return to draft', 'Archive website', 'Return to draft']) {
      await mutate(label);
      await page.getByText('Changes saved to the database. Reload settings to refresh shutdown history.', { exact: true }).waitFor();
    }
    const [[row]] = await pool.execute('SELECT status,automation_enabled,auto_publish_enabled FROM growth_websites WHERE organization_id=? AND id=?', [org, site]);
    assert.equal(row.status, 'draft'); assert.equal(row.automation_enabled, 0); assert.equal(row.auto_publish_enabled, 0);
    console.log('PASS browser: safe lifecycle controls persist with both switches disabled');
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false);
    console.log('PASS browser: settings fit a 390px viewport');
    await cookies(tokens[1]); await page.reload();
    await page.getByRole('button', { name: 'View settings', exact: true }).click(); await input.waitFor();
    assert.equal(await input.isDisabled(), true);
    assert.equal(await page.getByRole('button', { name: 'Save configuration', exact: true }).count(), 0);
    assert.equal(await page.getByRole('button', { name: 'Pause website', exact: true }).count(), 0);
    console.log('PASS browser: viewer sees read-only settings');
    await context.close(); console.log('PASS 5 browser scenarios with real local HTTPS API and MariaDB');
  } finally { if (browser) await browser.close(); await pool.end(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
