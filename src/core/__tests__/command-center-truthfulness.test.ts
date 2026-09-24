import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('unwired command center actions are visibly disabled with touch-accessible guidance',()=>{
 const source=readFileSync('src/app/page.tsx','utf8');
 assert.match(source,/Healthy integrations/);
 assert.match(source,/disabled aria-describedby="add-site-help"/);
 assert.match(source,/Onboarding is not available from this command center yet/);
 assert.match(source,/className="secondary" disabled aria-describedby="audit-help"/);
 assert.match(source,/Portfolio audit execution is not wired to this interface yet/);
 assert.match(source,/className="ghost" disabled aria-describedby=/);
 assert.match(source,/Site detail view is not available yet/);
});
