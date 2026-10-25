const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');
const {verify}=require('./verify-review-migration-chain-offline.cjs');
const root=path.resolve(__dirname,'..');
const result=verify();assert.equal(result.installed,false);assert.deepEqual(result.missingSources,['010','012']);
assert.equal(result.candidateFilesVerified.length,5);
assert.throws(()=>verify(file=>Buffer.concat([fs.readFileSync(path.join(root,file)),Buffer.from(' ')])),/HASH_MISMATCH/);
console.log('PASS review-only candidate hashes, absent-source blockers and mutation refusal; no SQL executed');
