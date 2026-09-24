import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('production API surface stays WordPress-backed',()=>{
 for(const path of ['src/app/api/dashboard/route.ts','src/app/api/approvals/route.ts']){
  const source=readFileSync(path,'utf8');
  assert.match(source,/WordPressGrowthOSClient/);
  assert.doesNotMatch(source,/supabase/i);
 }
});
