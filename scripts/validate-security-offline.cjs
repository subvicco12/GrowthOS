#!/usr/bin/env node
/** Offline-only GrowthOS migration and security source checks. No network, DB, or subprocesses. */
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const runner = read('scripts/mariadb-migration-runner.cjs');
const migration = read('database/mysql/009_website_feature_audit.sql');
const route = read('src/app/api/website-features/route.ts');
const policy = read('src/core/website-feature-controls.ts');
const registry = read('src/app/api/organization-websites/route.ts');
const dashboard = read('src/app/api/organization-dashboard/route.ts');
const approvals = read('src/app/api/organization-approvals/route.ts');
assert.doesNotThrow(() => new Function(runner.replace(/^#![^\n]*\n/, '')));
assert.match(runner, /GROWTHOS_MIGRATION_TEST_DISPOSABLE/);
assert.match(runner, /growthos_test_/);
assert.match(runner, /files\.length !== 9/);
assert.match(migration, /CREATE TABLE growth_website_feature_audit/);
assert.equal((migration.match(/CREATE TRIGGER /g) || []).length, 2);
assert.match(migration, /CHECK \(enabled = FALSE\)/);
assert.match(policy, /enabled: z\.literal\(false\)/);
assert.match(route, /beginTransaction\(\)/);
assert.match(route, /rollback\(\)/);
assert.match(route, /commit\(\)/);
assert.match(route, /WHERE id=\? AND organization_id=\?/);
assert.match(route, /INSERT INTO growth_website_feature_audit/);
for (const source of [registry, dashboard, approvals]) assert.match(source, /WHERE organization_id=\?/);
console.log('PASS: offline source checks. No database or network accessed.');
