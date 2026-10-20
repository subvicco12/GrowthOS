#!/usr/bin/env node
'use strict';
/** Review-only exact pins; never executes SQL or connects to a database. */
const fs=require('node:fs');const path=require('node:path');const {createHash}=require('node:crypto');
const root=path.resolve(__dirname,'..');
const pinned={'010':'bb10b32ec0186399ae10b1820541d4330aab500843cd0fcf2a82b4da515c2c5b','011':'7b9f5b15d2797c13bc6c30d04a08d49b5112a2545f264b543e86ffd5b303362a','012':'6d32ff6a950e9e90c40a4c5e5892c783914847c0f518faab980f08764bc310a6','013':'049f16c9c9eb9336c60b9d3ebf42d5f66763257146d4d99714b0f74e7aea481e','014':'d341bb3bc004b332f7cbc8253c2e5eb5255a4b8120860ae5d453f87762ee71b8'};
const digest=s=>createHash('sha256').update(s).digest('hex');
function verify(sql,deps){
 if(digest(sql)!==pinned['014'])throw Error('CANDIDATE_014_HASH_MISMATCH');
 for(const n of ['010','011','012','013'])if(typeof deps[n]!=='string'||digest(deps[n])!==pinned[n])throw Error('CANDIDATE_'+n+'_HASH_MISMATCH');
 const statements=[...sql.matchAll(/-- @statement\n([\s\S]*?)\/\/(?:\n|$)/g)].map(m=>m[1]);
 const outer=sql.replace(/-- @statement\n[\s\S]*?\/\/(?:\n|$)/g,'').replace(/^--[^\n]*\n/gm,'').replace(/^DELIMITER \/\/\n/m,'').replace(/^DELIMITER ;\n$/m,'').trim();
 if(outer||statements.length!==3||sql.includes('/*!')||sql.includes('/*+')||!sql.endsWith('DELIMITER ;\n')||statements.some(s=>!/^ALTER TABLE growth_publication_(?:observations|jobs|job_events)\s/m.test(s)))throw Error('CANDIDATE_014_GRAMMAR_DENIED');
 for(const token of ['uq_pub_observation_full_scope (organization_id,website_id,content_id,channel,issuer,event_id,payload_hash)','uq_pub_job_evidence_scope (organization_id,website_id,id,content_id,channel,claim_hash,destination_id)','fk_pub_event_job_scope FOREIGN KEY (organization_id,website_id,job_id,content_id,channel,claim_hash,destination_id)','fk_pub_event_obs_scope FOREIGN KEY (organization_id,website_id,content_id,channel,observation_issuer,observation_event_id,observation_hash)',"operation='reconcile' AND content_id IS NOT NULL AND channel IS NOT NULL AND claim_hash IS NOT NULL AND destination_id IS NOT NULL"]){if(!sql.includes(token))throw Error('CANDIDATE_014_SCOPE_MISSING');}
 return {status:'REVIEW_ONLY_UNINSTALLED',sha256:pinned['014'],statements:3,newForeignKeys:2,newForeignKeyColumns:14,dbExecution:false};
}
function read(args){const a={};for(const arg of args){const m=/^--candidate-(010|012)=(.+)$/.exec(arg);if(!m||a[m[1]])throw Error('CANDIDATE_ARGUMENT_DENIED');a[m[1]]=m[2];}if(!a['010']||!a['012'])throw Error('CANDIDATE_INPUT_REQUIRED');return {sql:fs.readFileSync(path.join(root,'database/proposals/publication-observation-scope-v1/014_observation_scope_candidate.sql'),'utf8'),deps:{'010':fs.readFileSync(a['010'],'utf8'),'011':fs.readFileSync(path.join(root,'database/proposals/011_authorization_trust_candidate.sql'),'utf8'),'012':fs.readFileSync(a['012'],'utf8'),'013':fs.readFileSync(path.join(root,'database/proposals/publication-funding-v1/013_publication_funding_jobs_candidate.sql'),'utf8')}};}
if(require.main===module)try{const {sql,deps}=read(process.argv.slice(2));process.stdout.write(JSON.stringify(verify(sql,deps))+'\n');}catch(e){process.stderr.write('REFUSED: '+e.message+'\n');process.exitCode=2;}
module.exports={verify,read,pinned};
