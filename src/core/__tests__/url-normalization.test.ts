import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePageUrl, dedupePageUrls } from '../url-normalization';
import { inspectSeoPages } from '../seo-intelligence';

test('normalizes equivalent root URL spellings',()=>{
 assert.equal(normalizePageUrl('https://EXAMPLE.com'),'https://example.com/');
 assert.equal(normalizePageUrl('https://example.com/'),'https://example.com/');
 assert.deepEqual(dedupePageUrls(['https://example.com','https://example.com/']),['https://example.com/']);
});

test('preserves non-root trailing slash semantics and query strings',()=>{
 assert.equal(normalizePageUrl('https://example.com/tools/'),'https://example.com/tools/');
 assert.equal(normalizePageUrl('https://example.com/tools'),'https://example.com/tools');
 assert.equal(normalizePageUrl('https://example.com/tools/?tier=pro'),'https://example.com/tools/?tier=pro');
 assert.deepEqual(dedupePageUrls(['https://example.com/tools','https://example.com/tools/']),['https://example.com/tools','https://example.com/tools/']);
});

test('SEO inspection analyzes equivalent URLs only once',()=>{
 const findings=inspectSeoPages([
  {url:'https://example.com',status:200,indexable:true,h1Count:0,wordCount:100,internalLinks:0},
  {url:'https://example.com/',status:200,indexable:true,h1Count:0,wordCount:100,internalLinks:0},
 ]);
 assert.equal(findings.filter(x=>x.key==='missing-title').length,1);
 assert.equal(new Set(findings.map(x=>x.url)).size,1);
});
