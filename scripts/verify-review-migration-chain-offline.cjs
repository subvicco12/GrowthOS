#!/usr/bin/env node
'use strict';
/** Read-only candidate-chain inventory. Never opens a database or installs SQL. */
const fs=require('node:fs');const path=require('node:path');const {createHash}=require('node:crypto');
const root=path.resolve(__dirname,'..');
const candidates={
  '010':['database/proposals/certification-010-016/010_content_persistence_candidate.sql','bb10b32ec0186399ae10b1820541d4330aab500843cd0fcf2a82b4da515c2c5b'],
  '011':['database/proposals/011_authorization_trust_candidate.sql','7b9f5b15d2797c13bc6c30d04a08d49b5112a2545f264b543e86ffd5b303362a'],
  '012':['database/proposals/certification-010-016/012_quota_v2_candidate.sql','6d32ff6a950e9e90c40a4c5e5892c783914847c0f518faab980f08764bc310a6'],
  '013':['database/proposals/publication-funding-v1/013_publication_funding_jobs_candidate.sql','049f16c9c9eb9336c60b9d3ebf42d5f66763257146d4d99714b0f74e7aea481e'],
  '014':['database/proposals/publication-observation-scope-v1/014_observation_scope_candidate.sql','d341bb3bc004b332f7cbc8253c2e5eb5255a4b8120860ae5d453f87762ee71b8'],
  '015':['database/proposals/product-authority-v1/015_product_authority_candidate.sql','50dc53b228a391bfe221cf92e7c855fedfb39c1ced1ed452da1aa56b96446551'],
  '016':['database/proposals/recommendation-review-v1/016_recommendation_review_candidate.sql','a2017e1daab3a27d37436ed8e45853e9bbb9ed5ec9d8ef0e480f1395f274377b']
};
const expected={
 '010':[5,7,6,17],'011':[8,17,19,52],'012':[3,7,7,22],'013':[3,7,9,41],
 '014':[0,0,2,14],'015':[7,12,12,19],'016':[3,6,5,12]
};
function verify(read=(file)=>fs.readFileSync(path.join(root,file)),order=Object.keys(candidates)){
 if(JSON.stringify(order)!==JSON.stringify(Object.keys(candidates)))throw Error('CANDIDATE_ORDER_OR_NUMBER_MISMATCH');
 const result=[];const tables=new Set();const triggers=new Set();let foreignKeys=0,foreignKeyColumns=0;
 const baseline=fs.readdirSync(path.join(root,'database/mysql')).filter(f=>/^00[1-9]_.*\.sql$/.test(f)).sort();
 if(baseline.length!==9)throw Error('BASELINE_MIGRATION_INVENTORY_MISMATCH');
 for(const name of baseline)for(const match of fs.readFileSync(path.join(root,'database/mysql',name),'utf8').matchAll(/\bCREATE TABLE\s+(\w+)/g))tables.add(match[1]);
 tables.add('growth_schema_migrations');
 for(const number of order){
  const [file,pinned]=candidates[number];
  const bytes=read(file);const hash=createHash('sha256').update(bytes).digest('hex');
  if(hash!==pinned)throw Error(`CANDIDATE_${number}_HASH_MISMATCH`);
  const sql=bytes.toString('utf8');
  if(sql.includes('/*!')||sql.includes('/*+')||/^\s*(?:DROP|TRUNCATE|REPLACE|GRANT|REVOKE|CREATE DATABASE|USE)\b/im.test(sql.split('\n').filter(x=>!/^\s*--/.test(x)).join('\n'))||
    (number!=='014'&&!sql.includes('ENGINE=InnoDB'))||
    (number==='014'&&!sql.includes('ALTER TABLE growth_publication_job_events')))
    throw Error(`CANDIDATE_${number}_UNSAFE_GRAMMAR`);
  const namedTables=[...sql.matchAll(/^CREATE TABLE (\w+) \(/gm)].map(match=>match[1]);
  const namedTriggers=[...sql.matchAll(/^CREATE TRIGGER (\w+) /gm)].map(match=>match[1]);
  const references=[...sql.matchAll(/FOREIGN KEY\s*\(([^)]*)\)\s*REFERENCES\s+(\w+)\s*\(([^)]*)\)/g)];
  const columns=references.reduce((sum,match)=>{
    const child=match[1].split(',').length,parent=match[3].split(',').length;
    if(child!==parent)throw Error('FOREIGN_KEY_ARITY_MISMATCH');return sum+child;
  },0);
  if(JSON.stringify([namedTables.length,namedTriggers.length,references.length,columns])!==JSON.stringify(expected[number]))
    throw Error(`CANDIDATE_${number}_INVENTORY_MISMATCH`);
  for(const name of namedTables){if(tables.has(name))throw Error('DUPLICATE_TABLE');tables.add(name);}
  for(const name of namedTriggers){if(triggers.has(name))throw Error('DUPLICATE_TRIGGER');triggers.add(name);}
  for(const match of references)if(!tables.has(match[2]))throw Error(`CANDIDATE_${number}_MISSING_DEPENDENCY_${match[2]}`);
  if(number==='014'&&['growth_publication_observations','growth_publication_jobs','growth_publication_job_events'].some(name=>!tables.has(name)))
    throw Error('CANDIDATE_014_MISSING_ALTER_TARGET');
  foreignKeys+=references.length;foreignKeyColumns+=columns;
  result.push({number,file,sha256:pinned,tables:namedTables,triggers:namedTriggers,foreignKeys:references.length,foreignKeyColumns:columns});
 }
 if(tables.size!==44||triggers.size!==56||foreignKeys!==60||foreignKeyColumns!==177)
   throw Error('CANDIDATE_CHAIN_TOTAL_MISMATCH');
 return {status:'REVIEW_ONLY_STATIC_PASS_LIVE_BLOCKED',reviewOnly:true,
  candidateFilesVerified:result,expectedCompleteSchema:{tables:44,triggers:60,foreignKeys:60,foreignKeyColumns:200,
    ledgerEntries:16},installed:false,liveCertified:false};
}
module.exports={verify};
if(require.main===module){try{if(process.argv.length!==2)throw Error('NO_ARGUMENTS_ALLOWED');console.log(JSON.stringify(verify()));}
 catch(error){console.error('REFUSED: '+error.message+'; no database access');process.exitCode=2;}}
