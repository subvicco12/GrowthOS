#!/usr/bin/env node
'use strict';
/** Fixed review-only inventory. No SQL execution or database connectivity. */
const fs=require('node:fs');const path=require('node:path');const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const file=path.resolve(__dirname,'../database/proposals/recommendation-review-v1/016_recommendation_review_candidate.sql');
const pinned='a2017e1daab3a27d37436ed8e45853e9bbb9ed5ec9d8ef0e480f1395f274377b';
const tables=['growth_recommendations','growth_recommendation_evidence','growth_recommendation_review_events'];
const triggers=['recommendation_evidence_no_update','recommendation_evidence_no_delete','recommendation_review_no_update',
 'recommendation_review_no_delete','recommendation_state_guard','recommendation_no_delete'];
function verify(sql=fs.readFileSync(file,'utf8')){
 if(createHash('sha256').update(sql).digest('hex')!==pinned)throw Error('CANDIDATE_016_HASH_MISMATCH');
 const names=[...sql.matchAll(/^CREATE TABLE (\w+) \(/gm)].map(x=>x[1]);
 const guards=[...sql.matchAll(/^CREATE TRIGGER (\w+) BEFORE (UPDATE|DELETE) ON (\w+)/gm)].map(x=>x[1]);
 const foreign=[...sql.matchAll(/FOREIGN KEY \(([^)]*)\) REFERENCES (\w+)\(([^)]*)\)/g)];
 if(JSON.stringify(names)!==JSON.stringify(tables)||JSON.stringify(guards)!==JSON.stringify(triggers)||
   foreign.length!==5||foreign.reduce((sum,x)=>sum+x[1].split(',').length,0)!==12||
   foreign.some(x=>x[1].split(',').length!==x[3].split(',').length)||
   !sql.includes('DELIMITER //\n')||!sql.includes('DELIMITER ;\n')||
   !sql.includes('matching_events <> 1')||sql.includes('/*!')||sql.includes('/*+'))throw Error('CANDIDATE_016_INVENTORY_MISMATCH');
 return {status:'REVIEW_ONLY_UNINSTALLED',sha256:pinned,tables:3,triggers:6,foreignKeys:5,foreignKeyColumns:12,
  priorCandidates:'010–015',dbExecution:false};
}
module.exports={verify};
if(require.main===module){try{if(process.argv.length!==2)throw Error('NO_ARGUMENTS_ALLOWED');const result=verify();
 assert.throws(()=>verify(fs.readFileSync(file,'utf8')+'\n-- mutation'),/CANDIDATE_016_HASH_MISMATCH/);
 console.log(JSON.stringify(result));}catch(error){console.error('REFUSED: '+error.message+'; no database access');process.exitCode=2;}}
