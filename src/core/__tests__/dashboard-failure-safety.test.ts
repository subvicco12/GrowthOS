import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('workspace dashboard renders only API-provided overview and reports failed requests', () => {
 const source=readFileSync('src/app/organization-dashboard.tsx','utf8');
 assert.match(source,/useState<Overview \| null>\(null\)/);
 assert.match(source,/if \(!response.ok\) throw new Error/);
 assert.match(source,/catch\(\(\) => setMessage\('Workspace overview unavailable.'/);
 assert.match(source,/overview &&/);
 assert.match(source,/overview.websiteCount/);
 assert.match(source,/overview.pendingApprovals/);
 assert.doesNotMatch(source,/sites\.filter|buildPortfolio|fallback/i);
});
