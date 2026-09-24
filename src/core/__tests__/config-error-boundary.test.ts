import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('API routes contain an invalid WordPress configuration boundary',()=>{
 for(const path of ['src/app/api/dashboard/route.ts','src/app/api/approvals/route.ts']){
  const source=readFileSync(path,'utf8');
  assert.match(source,/try\{config=readWordPressGrowthOSConfig\(\);\}catch/);
  assert.match(source,/INVALID_CONFIGURATION/);
  assert.match(source,/status:503/);
 }
});
