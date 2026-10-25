const assert=require('node:assert/strict');
const {expected,validate}=require('./verify-review-recovery-manifest-offline.cjs');
const x=expected();const digest='a'.repeat(64);
const good={schema:'growthos_test_restore_01',version:'review-010-016-v1',ledger:x.ledger,triggers:x.triggers,
 tableContent:Object.fromEntries(x.tables.map(name=>[name,{rows:0,sha256:digest}]))};
assert.equal(validate(good).liveRestoreCertified,false);
const corrupted=structuredClone(good);corrupted.tableContent[x.tables[0]].sha256='bad';
assert.throws(()=>validate(corrupted),/CONTENT_HASH_INVALID/);
for(const change of [{schema:'growthos_prod'},{version:'v0'},{ledger:{...good.ledger,['016_recommendation_review_candidate.sql']:'b'.repeat(64)}},
 {triggers:good.triggers.slice(1)},{tableContent:Object.fromEntries(Object.entries(good.tableContent).slice(1))}])
 assert.throws(()=>validate({...good,...change}),/SCOPE_OR_INVENTORY_MISMATCH/);
console.log('PASS review-only recovery manifest inventory and corruption refusals; no dump restored');
