const assert=require('node:assert/strict');const {spawnSync}=require('node:child_process');
const {plan,statements,install}=require('./disposable-candidate-installer.cjs');
assert.deepEqual(plan().map(x=>x.statements.length),[13,25,10,14,3,19,9]);
assert.throws(()=>statements('CREATE TABLE x (id INT)'),/INCOMPLETE_CANDIDATE_SQL/);
assert.throws(()=>statements('DELIMITER $$\nCREATE TABLE x (id INT)$$'),/UNSUPPORTED_DELIMITER/);
const run=spawnSync(process.execPath,['scripts/disposable-candidate-installer.cjs','--install-disposable'],{encoding:'utf8'});
assert.equal(run.status,2);assert.match(run.stderr,/INSTALL_AUTHORIZATION_REQUIRED/);
assert.doesNotMatch(run.stderr,/synthetic_local_password/);
const wrong=spawnSync(process.execPath,['scripts/disposable-candidate-installer.cjs','--resume'],{encoding:'utf8'});
assert.equal(wrong.status,2);assert.match(wrong.stderr,/UNSUPPORTED_MODE/);
install({}).then(()=>{throw Error('SHOULD_REFUSE');},error=>assert.match(error.message,/INSTALL_AUTHORIZATION_REQUIRED/));
const synthetic={GROWTHOS_CANDIDATE_INSTALL:'EXPLICIT_DISPOSABLE_INSTALL_ONLY',
 GROWTHOS_CANDIDATE_CERTIFICATION:'EXPLICIT_DISPOSABLE_REVIEW_ONLY',GROWTHOS_CANDIDATE_ISOLATION_VERIFIED:'YES',
 GROWTHOS_DB_HOST:'127.0.0.1',GROWTHOS_DB_PORT:'3307',GROWTHOS_DB_NAME:'growthos_test_synthetic_01',
 GROWTHOS_DB_USER:'synthetic_growthos_test',GROWTHOS_DB_PASSWORD:'synthetic_disposable_password'};
install(synthetic).then(()=>{throw Error('SHOULD_REFUSE');},error=>assert.match(error.message,/INDEPENDENT_SERVER_ISOLATION_GATE_UNAVAILABLE/));
console.log('PASS candidate parser counts, incomplete/delimiter refusal and unauthorized install/retry refusal; no database');
