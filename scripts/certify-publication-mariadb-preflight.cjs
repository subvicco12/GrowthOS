#!/usr/bin/env node
'use strict';
// No database commands. Refuses until a future operator supplies an isolated runner.
const {spawnSync}=require('node:child_process');
const {readFileSync}=require('node:fs');
const {createHash}=require('node:crypto');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const sha=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
const expected={
 '011':['database/proposals/011_authorization_trust_candidate.sql','7b9f5b15d2797c13bc6c30d04a08d49b5112a2545f264b543e86ffd5b303362a'],
 '013':['database/proposals/publication-funding-v1/013_publication_funding_jobs_candidate.sql','049f16c9c9eb9336c60b9d3ebf42d5f66763257146d4d99714b0f74e7aea481e'],
 '014':['database/proposals/publication-observation-scope-v1/014_observation_scope_candidate.sql','d341bb3bc004b332f7cbc8253c2e5eb5255a4b8120860ae5d453f87762ee71b8']
};
for(const [id,[file,pin]] of Object.entries(expected))if(sha(path.join(root,file))!==pin)throw Error(`CANDIDATE_${id}_HASH_MISMATCH`);
for(const [id,env,pin] of [['010','GROWTHOS_CANDIDATE_010','bb10b32ec0186399ae10b1820541d4330aab500843cd0fcf2a82b4da515c2c5b'],['012','GROWTHOS_CANDIDATE_012','6d32ff6a950e9e90c40a4c5e5892c783914847c0f518faab980f08764bc310a6']]){
 if(!process.env[env]||sha(process.env[env])!==pin)throw Error(`CANDIDATE_${id}_PINNED_FILE_REQUIRED`);
}
const versions=Object.fromEntries(['node','docker','mariadbd','mariadb','mariadb-dump'].map(command=>{
 const r=spawnSync(command,['--version'],{encoding:'utf8',timeout:5000});return [command,r.error?'unavailable':(r.stdout||r.stderr).trim().split('\n')[0]];
}));
const ready=/^v22\./.test(versions.node)&&/11\.8\./.test(versions.mariadbd)&&/11\.8\./.test(versions.mariadb)&&versions.docker!=='unavailable'&&versions['mariadb-dump']!=='unavailable';
console.log(JSON.stringify({candidateHashes:'MATCH',versions,status:ready?'ENVIRONMENT_TO_VERIFY_MANUALLY':'BLOCKED',liveTestsExecuted:false,required:'Separate empty growthos_test_* schemas, loopback-only disposable MariaDB 11.8, synthetic credentials, two independent connections, explicit no-production endpoint proof, independently current trust anchor.'},null,2));
if(!ready)process.exitCode=2;
