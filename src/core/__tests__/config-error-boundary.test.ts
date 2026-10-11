import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('disabled legacy routes cannot initialize a WordPress client or database',()=>{
 for(const path of ['src/app/api/dashboard/route.ts','src/app/api/approvals/route.ts']){
  const source=readFileSync(path,'utf8');
  assert.match(source,/LEGACY_ADAPTER_DISABLED/);
  assert.doesNotMatch(source,/import\s|WordPressGrowthOSClient|readWordPressGrowthOSConfig|supabase|createPool/);
 }
});
