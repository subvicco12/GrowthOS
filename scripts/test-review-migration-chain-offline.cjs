const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');
const {verify}=require('./verify-review-migration-chain-offline.cjs');
const root=path.resolve(__dirname,'..');
const result=verify();assert.equal(result.installed,false);assert.equal(result.liveCertified,false);
assert.equal(result.candidateFilesVerified.length,7);assert.deepEqual(result.expectedCompleteSchema,
 {tables:44,triggers:60,foreignKeys:60,foreignKeyColumns:200,ledgerEntries:16});
assert.throws(()=>verify(file=>Buffer.concat([fs.readFileSync(path.join(root,file)),Buffer.from(' ')])),/HASH_MISMATCH/);
assert.throws(()=>verify(file=>{if(file.includes('/010_'))throw Error('MISSING_CANDIDATE_010');return fs.readFileSync(path.join(root,file));}),/MISSING_CANDIDATE_010/);
assert.throws(()=>verify(undefined,['011','010','012','013','014','015','016']),/ORDER_OR_NUMBER_MISMATCH/);
assert.throws(()=>verify(undefined,['010','011','012','013','014','015','015']),/ORDER_OR_NUMBER_MISMATCH/);
console.log('PASS seven pinned review-only candidates, inventory, dependency order and mutation/missing-source refusals; no SQL executed');
