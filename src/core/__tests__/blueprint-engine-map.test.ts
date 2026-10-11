import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('workspace shell routes sections to organization-scoped views', () => {
 const source=readFileSync('src/app/page.tsx','utf8');
 for(const [section,component] of [
  ['home','OrganizationDashboard'],['websites','OrganizationWebsiteRegistry'],
  ['growth','OrganizationApprovalInbox'],['automation','OrganizationAutomationStatus'],
  ['settings','OrganizationSettings']
 ]) assert.ok(source.includes(`section === '${section}' && <${component}`));
 assert.match(source,/<OrganizationSelector\s*\/>/);
 assert.doesNotMatch(source,/22 engines|Twenty GrowthOS engines/);
});
