#!/usr/bin/env node
'use strict';
const assert=require('node:assert/strict');
const {options,checkPins,assess,pins}=require('./certify-final-publication-preflight.cjs');
const good=['--candidate-010=/tmp/review-010.sql','--candidate-012=/tmp/review-012.sql','--source-schema=growthos_test_source','--destination-schema=growthos_test_destination','--host=127.0.0.1'];
let refusals=0;
for(const args of [good.slice(1),good.slice(0,-1),good.map(x=>x.replace('growthos_test_source','growthos')),good.map(x=>x.replace('growthos_test_destination','growthos_test_source')),good.map(x=>x.replace('127.0.0.1','db.example')),good.concat('--host=127.0.0.1'),good.concat('--unsafe=1')]){assert.throws(()=>options(args));refusals++;}
const o=options(good);assert.equal(o.host,'127.0.0.1');
let reads=0;assert.throws(()=>checkPins(o,()=>{reads++;return Buffer.from('tampered');}),/CANDIDATE_010_HASH_MISMATCH/);assert.equal(reads,1);refusals++;
assert.equal(Object.keys(pins).length,5);
assert.equal(assess({nodeVersion:'v24.19.0',serverVersion:'unavailable',clientVersion:'unavailable',dumpVersion:'unavailable'}).status,'BLOCKED_RUNTIME');
assert.deepEqual(assess({nodeVersion:'v22.16.0',serverVersion:'11.8.5',clientVersion:'11.8.5',dumpVersion:'11.8.5'}),{status:'ISOLATION_REVIEW_REQUIRED',liveTestsExecuted:false,sqlAuthorized:false});
process.stdout.write(`PASS: ${refusals} offline refusals; even matching versions do not authorize SQL.\n`);
