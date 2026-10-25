#!/usr/bin/env node
'use strict';
/** Read-only candidate-chain inventory. Never opens a database or installs SQL. */
const fs=require('node:fs');const path=require('node:path');const {createHash}=require('node:crypto');
const root=path.resolve(__dirname,'..');
const candidates={
  '011':['database/proposals/011_authorization_trust_candidate.sql','7b9f5b15d2797c13bc6c30d04a08d49b5112a2545f264b543e86ffd5b303362a'],
  '013':['database/proposals/publication-funding-v1/013_publication_funding_jobs_candidate.sql','049f16c9c9eb9336c60b9d3ebf42d5f66763257146d4d99714b0f74e7aea481e'],
  '014':['database/proposals/publication-observation-scope-v1/014_observation_scope_candidate.sql','d341bb3bc004b332f7cbc8253c2e5eb5255a4b8120860ae5d453f87762ee71b8'],
  '015':['database/proposals/product-authority-v1/015_product_authority_candidate.sql','50dc53b228a391bfe221cf92e7c855fedfb39c1ced1ed452da1aa56b96446551'],
  '016':['database/proposals/recommendation-review-v1/016_recommendation_review_candidate.sql','a2017e1daab3a27d37436ed8e45853e9bbb9ed5ec9d8ef0e480f1395f274377b']
};
function verify(read=(file)=>fs.readFileSync(path.join(root,file))){
 const result=[];const tables=new Set();const triggers=new Set();
 for(const [number,[file,pinned]] of Object.entries(candidates)){
  const bytes=read(file);const hash=createHash('sha256').update(bytes).digest('hex');
  if(hash!==pinned)throw Error(`CANDIDATE_${number}_HASH_MISMATCH`);
  const sql=bytes.toString('utf8');
  if(sql.includes('/*!')||sql.includes('/*+')||(number!=='014'&&!sql.includes('ENGINE=InnoDB'))||
    (number==='014'&&!sql.includes('ALTER TABLE growth_publication_job_events')))
    throw Error(`CANDIDATE_${number}_UNSAFE_GRAMMAR`);
  const namedTables=[...sql.matchAll(/^CREATE TABLE (\w+) \(/gm)].map(match=>match[1]);
  const namedTriggers=[...sql.matchAll(/^CREATE TRIGGER (\w+) /gm)].map(match=>match[1]);
  for(const name of namedTables){if(tables.has(name))throw Error('DUPLICATE_TABLE');tables.add(name);}
  for(const name of namedTriggers){if(triggers.has(name))throw Error('DUPLICATE_TRIGGER');triggers.add(name);}
  result.push({number,sha256:pinned,tables:namedTables.length,triggers:namedTriggers.length});
 }
 return {status:'BLOCKED_MISSING_010_012_AND_LIVE_CERTIFICATION',reviewOnly:true,
  candidateFilesVerified:result,missingSources:['010','012'],tablesInAvailableCandidates:tables.size,
  triggersInAvailableCandidates:triggers.size,installed:false};
}
module.exports={verify};
if(require.main===module){try{if(process.argv.length!==2)throw Error('NO_ARGUMENTS_ALLOWED');console.log(JSON.stringify(verify()));}
 catch(error){console.error('REFUSED: '+error.message+'; no database access');process.exitCode=2;}}
