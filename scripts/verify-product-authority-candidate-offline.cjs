#!/usr/bin/env node
'use strict';
/** Fixed review-only bytes and inventory. Never connects to MariaDB or installs SQL. */
const fs=require('node:fs');
const path=require('node:path');
const {createHash}=require('node:crypto');
const file=path.resolve(__dirname,'../database/proposals/product-authority-v1/015_product_authority_candidate.sql');
const pinned='50dc53b228a391bfe221cf92e7c855fedfb39c1ced1ed452da1aa56b96446551';
const tables=['growth_intelligence_evidence','growth_intelligence_evidence_events','growth_plan_assignments',
  'growth_plan_assignment_events','growth_plan_usage','growth_plan_usage_events','growth_plan_usage_transitions'];
function verify(sql=fs.readFileSync(file,'utf8')) {
  if(typeof sql!=='string'||createHash('sha256').update(sql).digest('hex')!==pinned)throw Error('CANDIDATE_015_HASH_MISMATCH');
  const names=[...sql.matchAll(/^CREATE TABLE (\w+) \(/gm)].map(x=>x[1]);
  const triggers=[...sql.matchAll(/^CREATE TRIGGER (\w+) BEFORE (UPDATE|DELETE) ON (\w+)/gm)];
  const foreignKeys=[...sql.matchAll(/FOREIGN KEY \(([^)]*)\) REFERENCES (\w+)\(([^)]*)\)/g)];
  const fkColumns=foreignKeys.reduce((sum,x)=>sum+x[1].split(',').length,0);
  if(JSON.stringify(names)!==JSON.stringify(tables)||triggers.length!==12||foreignKeys.length!==12||fkColumns!==19||
      foreignKeys.some(x=>x[1].split(',').length!==x[3].split(',').length)||
      !sql.startsWith('-- REVIEW CANDIDATE ONLY.')||sql.includes('/*!')||sql.includes('/*+')||
      !sql.includes('DELIMITER //\n')||!sql.includes('DELIMITER ;\n'))throw Error('CANDIDATE_015_INVENTORY_MISMATCH');
  return {status:'REVIEW_ONLY_UNINSTALLED',sha256:pinned,tables:7,triggers:12,foreignKeys:12,foreignKeyColumns:19,
    requiredPriorCandidates:'010–014',dbExecution:false};
}
module.exports={verify};
if(require.main===module){try{if(process.argv.length!==2)throw Error('NO_ARGUMENTS_ALLOWED');console.log(JSON.stringify(verify()));}
  catch(error){console.error('REFUSED: '+error.message+'; no database access');process.exitCode=2;}}
