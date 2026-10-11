import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('unwired workspace operations remain read-only and registration remains draft-only', () => {
 const shell=readFileSync('src/app/page.tsx','utf8');
 const automation=readFileSync('src/app/organization-automation-status.tsx','utf8');
 const registry=readFileSync('src/app/organization-website-registry.tsx','utf8');
 assert.match(shell,/Settings are read-only/);
 assert.match(automation,/No jobs can be started from this page/);
 assert.doesNotMatch(automation,/<button|method:\s*['"](?:POST|PATCH|DELETE)/);
 assert.match(registry,/Register website \(draft only\)/);
 assert.match(registry,/Verification and automation remain disabled/);
 assert.match(registry,/enabled: false/);
});
