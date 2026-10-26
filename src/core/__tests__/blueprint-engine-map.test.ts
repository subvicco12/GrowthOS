import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('workspace shell routes sections to organization-scoped views', () => {
 const source=readFileSync('src/app/page.tsx','utf8');
 for(const [section,component] of [
  ['approvals','OrganizationApprovalInbox'],['automation','OrganizationAutomationStatus'],
  ['costs','CostCenter'],['connectors','ConnectorsPanel'],['governance','GovernancePanel']
 ]) assert.match(source,new RegExp(`section\\s*===\\s*'${section}'\\s*&&\\s*<${component}`));
 assert.match(source,/section==='home'&&<><OrganizationDashboard/);
 assert.match(source,/hidden=\{section!=='websites'\}.*<OrganizationWebsiteRegistry/);
 assert.match(source,/preferredWebsiteId=\{selectedWebsite\}/);
 assert.match(source,/<OrganizationSelector\s+onBeforeSelection=/);
 assert.match(source,/setIntelligenceVisited\(section==='intelligence'\)/);
 assert.match(source,/hidden=\{section!=='intelligence'\}/);
 assert.doesNotMatch(source,/22 engines|Twenty GrowthOS engines/);
});
