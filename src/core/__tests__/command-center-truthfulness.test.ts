import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('unwired command center actions are visibly disabled',()=>{
 const source=readFileSync('src/app/page.tsx','utf8');
 assert.match(source,/Healthy integrations/);
 assert.match(source,/disabled title="Website onboarding is not available/);
 assert.match(source,/className="secondary" disabled title="Portfolio audit execution is not wired/);
 assert.match(source,/className="ghost" disabled title="Site detail view is not available/);
});
