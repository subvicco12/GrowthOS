#!/usr/bin/env node
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {verify}=require('./verify-publication-funding-proposal.cjs');
const dir=path.resolve(__dirname,'../database/proposals/publication-funding-v1');
try{
 const args={};for(const s of process.argv.slice(2)){const m=/^--candidate-(010|012)=(.+)$/.exec(s);if(!m||args[m[1]])throw Error('CANDIDATE_ARGUMENTS_REQUIRED');args[m[1]]=m[2];}
 if(!args['010']||!args['012'])throw Error('CANDIDATES_010_012_REQUIRED');
 const sql=fs.readFileSync(path.join(dir,'013_publication_funding_jobs_candidate.sql'),'utf8');
 const manifest=JSON.parse(fs.readFileSync(path.join(dir,'013_manifest.json'),'utf8'));
 const deps={'010':fs.readFileSync(args['010'],'utf8'),'011':fs.readFileSync(path.join(__dirname,'../database/proposals/011_authorization_trust_candidate.sql'),'utf8'),'012':fs.readFileSync(args['012'],'utf8')};
 const output=verify(sql,manifest,deps);assert.equal(output.dbExecution,false);assert.equal(output.counts.newForeignKeyColumns,41);
 let refusals=0;const refuse=(value,m=manifest,d=deps)=>{assert.throws(()=>verify(value,m,d));refusals++;};
 refuse(sql+'USE growthos_prod;\n');
 refuse(sql.replace('CREATE TABLE growth_publication_jobs','CREATE TABLE growth_wrong_jobs'));
 refuse(sql.replace('CHECK (publication_operation=\'publication\')','CHECK (publication_operation=\'generation\')'));
 refuse(sql.replace('FOREIGN KEY (organization_id,website_id,content_id,publication_operation,publication_reservation_id)','FOREIGN KEY (organization_id,publication_reservation_id)'));
 refuse(sql.replace('growth_pub_binding_no_delete','growth_pub_binding_allow_delete'));
 refuse(sql.replace('OLD.state IN (\'confirmed\',\'absent\',\'cancelled\',\'operator_review\')','FALSE'));
 refuse(sql.replace('DELIMITER ;\n','/*! DROP TABLE growth_publication_claims */\nDELIMITER ;\n'));
 refuse(sql.replace('DELIMITER ;\n','SET FOREIGN_KEY_CHECKS=0;\nDELIMITER ;\n'));
 refuse(sql,{...manifest,sha256:'0'.repeat(64)});
 refuse(sql,{...manifest,plannedTotalIfInstalledAfter012:{...manifest.plannedTotalIfInstalledAfter012,ledgerEntries:12}});
 refuse(sql,manifest,{...deps,'010':deps['010']+'\n-- drift\n'});
 refuse(sql,manifest,{...deps,'012':deps['012']+'\n-- drift\n'});
 assert.equal(refusals,12);
 process.stdout.write(`PASS review-only candidate: 1 positive, ${refusals} negative refusals; zero database calls\n`);
}catch(error){process.stderr.write('FAIL: '+error.stack+'\n');process.exitCode=1;}
