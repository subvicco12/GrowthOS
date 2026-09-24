import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('dashboard does not present static portfolio values as live fallback data',()=>{
 const source=readFileSync('src/app/page.tsx','utf8');
 assert.match(source,/setSnapshot\(null\);setError/);
 assert.match(source,/snapshot\?snapshot\.sites\.length:'—'/);
 assert.match(source,/snapshot\?snapshot\.sites:\[\]/);
 assert.doesNotMatch(source,/snapshot\?\.sites\.length\?snapshot\.sites:sites\.filter/);
});
