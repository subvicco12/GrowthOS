#!/usr/bin/env node
'use strict';
const assert=require('node:assert/strict');const {verify,read}=require('./verify-publication-observation-scope-candidate.cjs');
try{
 const {sql,deps}=read(process.argv.slice(2));assert.equal(verify(sql,deps).dbExecution,false);let refusals=0;
 const deny=(s,d=deps)=>{assert.throws(()=>verify(s,d));refusals++;};
 deny(sql.replace('website_id,content_id,channel,issuer,event_id,payload_hash','issuer,event_id,payload_hash'));
 deny(sql.replace('website_id,job_id,content_id,channel,claim_hash,destination_id','job_id,content_id,channel,claim_hash,destination_id'));
 deny(sql.replace("operation='reconcile' AND content_id IS NOT NULL","operation='reconcile' AND content_id IS NULL"));
 deny(sql.replace('destination_id IS NOT NULL','destination_id IS NULL'));
 deny(sql+'USE growthos_prod;\n');deny(sql.replace('DELIMITER ;\n','/*! DROP TABLE growth_publication_claims */\nDELIMITER ;\n'));
 deny(sql,deps&&{...deps,'013':deps['013']+'\n-- tampered\n'});
 assert.equal(refusals,7);process.stdout.write(`PASS: 014 static scope: one positive, ${refusals} refusals; no database calls\n`);
}catch(e){process.stderr.write('FAIL: '+e.stack+'\n');process.exitCode=1;}
