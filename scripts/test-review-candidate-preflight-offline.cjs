const assert=require('node:assert/strict');
const {assertDisposable}=require('./review-candidate-disposable-preflight.cjs');
const safe={GROWTHOS_CANDIDATE_CERTIFICATION:'EXPLICIT_DISPOSABLE_REVIEW_ONLY',
 GROWTHOS_CANDIDATE_ISOLATION_VERIFIED:'YES',GROWTHOS_DB_HOST:'127.0.0.1',GROWTHOS_DB_PORT:'3307',
 GROWTHOS_DB_NAME:'growthos_test_review_01',GROWTHOS_DB_USER:'synthetic_review_user',
 GROWTHOS_DB_PASSWORD:'synthetic_local_password_01'};
assert.equal(assertDisposable(safe).database,safe.GROWTHOS_DB_NAME);
const cases=[['GROWTHOS_CANDIDATE_CERTIFICATION','NO'],['GROWTHOS_CANDIDATE_ISOLATION_VERIFIED','NO'],
 ['GROWTHOS_DB_HOST','database.example'],['GROWTHOS_DB_HOST','localhost'],['GROWTHOS_DB_PORT','0'],
 ['GROWTHOS_DB_NAME','growthos_prod'],['GROWTHOS_DB_USER','root'],['GROWTHOS_DB_PASSWORD','real_password']];
for(const [key,value] of cases)assert.throws(()=>assertDisposable({...safe,[key]:value}),/REQUIRED/);
for(const key of ['DATABASE_URL','GROWTHOS_PRODUCTION_APPROVAL'])
 assert.throws(()=>assertDisposable({...safe,[key]:'set'}),/PRODUCTION_CONFIGURATION_PRESENT/);
console.log(`PASS ${cases.length+2} disposable preflight refusals; no network access`);
