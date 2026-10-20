#!/usr/bin/env node
'use strict';
/** Review-only static package verifier. Never opens a DB connection or executes SQL. */
const fs=require('node:fs');
const path=require('node:path');
const {createHash}=require('node:crypto');
const dir=path.resolve(__dirname,'../database/proposals/publication-funding-v1');
const pinned={
 '010':'bb10b32ec0186399ae10b1820541d4330aab500843cd0fcf2a82b4da515c2c5b',
 '011':'7b9f5b15d2797c13bc6c30d04a08d49b5112a2545f264b543e86ffd5b303362a',
 '012':'6d32ff6a950e9e90c40a4c5e5892c783914847c0f518faab980f08764bc310a6',
 '013':'049f16c9c9eb9336c60b9d3ebf42d5f66763257146d4d99714b0f74e7aea481e'
};
const digest=v=>createHash('sha256').update(v).digest('hex');
const equal=(a,b,label)=>{if(JSON.stringify(a)!==JSON.stringify(b))throw Error(label+'_MISMATCH');};
function verify(sql,manifest,dependencies){
 if(manifest.schemaVersion!==1||manifest.status!=='REVIEW_ONLY_UNINSTALLED'||manifest.candidate!=='013_publication_funding_jobs_candidate.sql')throw Error('MANIFEST_IDENTITY_MISMATCH');
 equal(manifest.dependencies,{"010":pinned['010'],"011":pinned['011'],"012":pinned['012']},'DEPENDENCY_PINS');
 if(manifest.sha256!==pinned['013']||digest(sql)!==pinned['013'])throw Error('PROPOSAL_HASH_MISMATCH');
 for(const n of ['010','011','012'])if(typeof dependencies[n]!=='string'||digest(dependencies[n])!==pinned[n])throw Error('DEPENDENCY_'+n+'_HASH_MISMATCH');
 if(!sql.startsWith('-- REVIEW CANDIDATE 013 ONLY.')||!sql.includes('\nDELIMITER //\n')||!sql.endsWith('DELIMITER ;\n')||sql.includes('/*!')||sql.includes('/*+'))throw Error('PROPOSAL_GRAMMAR_MISMATCH');
 const statements=[...sql.matchAll(/-- @statement\n([\s\S]*?)\/\/(?:\n|$)/g)].map(m=>m[1].trim());
 const stripped=sql.replace(/-- @statement\n[\s\S]*?\/\/(?:\n|$)/g,'').replace(/^--[^\n]*\n/gm,'').replace(/^DELIMITER \/\/\n/m,'').replace(/^DELIMITER ;\n$/m,'').trim();
 if(stripped||statements.length!==14||statements.some(s=>!s||s.includes('//')||!/^ALTER TABLE \w+ ADD UNIQUE KEY \w+ \([\s\S]*\)$|^CREATE TABLE \w+ \([\s\S]*\) ENGINE=InnoDB ROW_FORMAT=DYNAMIC DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci$|^CREATE TRIGGER \w+ BEFORE (?:INSERT|UPDATE|DELETE) ON \w+ FOR EACH ROW [\s\S]+$/m.test(s)))throw Error('PROPOSAL_STATEMENT_GRAMMAR_MISMATCH');
 const matches=(regex)=>[...sql.matchAll(regex)].map(m=>m[1]);
 const altered=matches(/^ALTER TABLE (\w+) ADD UNIQUE KEY/gm),tables=matches(/^CREATE TABLE (\w+)/gm),triggers=matches(/^CREATE TRIGGER (\w+)/gm);
 equal(altered,manifest.alteredTables,'ALTERED_TABLES');equal(tables,manifest.newTables,'NEW_TABLES');equal(triggers,manifest.newTriggers,'NEW_TRIGGERS');
 const fks={};let totalColumns=0;
 for(const m of sql.matchAll(/CONSTRAINT (fk_\w+) FOREIGN KEY \(([^)]*)\)/g)){
  if(Object.hasOwn(fks,m[1]))throw Error('FOREIGN_KEY_DUPLICATE');
  const n=m[2].split(',').length;fks[m[1]]=n;totalColumns+=n;
 }
 equal(fks,manifest.newForeignKeys,'FOREIGN_KEYS');
 const count={statements:statements.length,newTables:tables.length,alteredTables:altered.length,newTriggers:triggers.length,newForeignKeys:Object.keys(fks).length,newForeignKeyColumns:totalColumns,declaredIndexes:(sql.match(/\b(?:PRIMARY KEY|UNIQUE KEY|(?<!FOREIGN )KEY)\b/g)||[]).length};
 equal(count,manifest.counts,'INVENTORY');
 equal(manifest.plannedTotalIfInstalledAfter012,{tables:34,triggers:42,foreignKeyColumns:155,ledgerEntries:13},'PLANNED_TOTAL');
 return {status:'REVIEW_ONLY',sha256:pinned['013'],counts:count,planned:manifest.plannedTotalIfInstalledAfter012,dbExecution:false};
}
if(require.main===module){
 try{
  const arg={};for(const a of process.argv.slice(2)){const m=/^--candidate-(010|012)=(.+)$/.exec(a);if(!m||arg[m[1]])throw Error('USAGE: --candidate-010=PATH --candidate-012=PATH');arg[m[1]]=m[2];}
  if(!arg['010']||!arg['012'])throw Error('REQUIRED_READ_ONLY_CANDIDATES_010_012_MISSING');
  const sql=fs.readFileSync(path.join(dir,'013_publication_funding_jobs_candidate.sql'),'utf8');
  const manifest=JSON.parse(fs.readFileSync(path.join(dir,'013_manifest.json'),'utf8'));
  const deps={'010':fs.readFileSync(arg['010'],'utf8'),'011':fs.readFileSync(path.join(__dirname,'../database/proposals/011_authorization_trust_candidate.sql'),'utf8'),'012':fs.readFileSync(arg['012'],'utf8')};
  process.stdout.write(JSON.stringify(verify(sql,manifest,deps))+'\n');
 }catch(error){process.stderr.write('REFUSED: '+error.message+'\n');process.exitCode=2;}
}
module.exports={verify,pinned};
