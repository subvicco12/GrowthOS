import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeWordPressEvidence } from '../wordpress-evidence';

test('decodes WordPress JSON evidence strings',()=>{
 assert.deepEqual(decodeWordPressEvidence('["canonical missing","thin content"]'),['canonical missing','thin content']);
});
test('accepts arrays and safely rejects malformed evidence',()=>{
 assert.deepEqual(decodeWordPressEvidence(['one',2,'two']),['one','two']);
 assert.deepEqual(decodeWordPressEvidence('{bad json'),[]);
 assert.deepEqual(decodeWordPressEvidence(null),[]);
});
