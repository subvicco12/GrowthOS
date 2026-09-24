import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('approval inbox requires explicit confirmation before mutation',()=>{
 const source=readFileSync('src/app/approval-inbox-panel.tsx','utf8');
 assert.match(source,/setPending\(\{id:item\.id,action\}\)/);
 assert.match(source,/Confirm \{pending\.action\}/);
 assert.match(source,/void act\(decision\.id,decision\.action\)/);
 assert.match(source,/Cancel/);
});
