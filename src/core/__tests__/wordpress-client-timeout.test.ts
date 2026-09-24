import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('WordPress client bounds every production fetch',()=>{
 const source=readFileSync('src/core/wordpress-growthos-client.ts','utf8');
 assert.match(source,/REQUEST_TIMEOUT_MS=10000/);
 const fetches=source.match(/fetch\(/g)??[];
 const signals=source.match(/signal:this\.signal\(\)/g)??[];
 assert.ok(fetches.length>=2);
 assert.equal(signals.length,fetches.length);
});
