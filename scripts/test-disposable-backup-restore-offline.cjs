#!/usr/bin/env node
'use strict';
const assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
const path=require('node:path');
const {validateDump}=require('./disposable-dump-guard.cjs');
const source='growthos_test_source',dest='growthos_test_destination';
const clean=Buffer.from('CREATE TABLE `growth_organizations` (`id` int) ENGINE=InnoDB;\n');
assert.doesNotThrow(()=>validateDump(clean,source,dest));
const unsafe=[
 ['USE `growthos_test_other`;', 'database switch'],
 ['/*!40100 USE `growthos_test_other`; */', 'database switch'],
 ['CREATE DATABASE `growthos_test_other`;', 'database-level DDL'],
 ['ALTER SCHEMA growthos_test_other;', 'database-level DDL'],
 ['DROP DATABASE growthos_test_other;', 'database-level DDL'],
 ['\\connect growthos_test_other', 'client command'],
 ['/*!40100 USE `growthos_test_other` */;', 'database switch'],
 ['CREATE /* hidden */ DATABASE growthos_test_other;', 'database-level DDL'],
 ['INSERT INTO `other_schema`.`growth_users` VALUES (1);', 'qualified schema reference'],
 ['INSERT INTO `'+source+'`.`growth_users` VALUES (1);', 'source schema'],
 ['INSERT INTO `'+dest+'`.`growth_users` VALUES (1);', 'qualified schema reference']
];
for(const [sql,message] of unsafe)assert.throws(()=>validateDump(Buffer.from(sql),source,dest),new RegExp(message));
assert.throws(()=>validateDump(Buffer.from([0xff]),source,dest),/invalid UTF-8/);
const candidate=path.join(__dirname,'disposable-backup-restore-rehearsal-candidate.cjs');
function run(args,env={}){return spawnSync(process.execPath,[candidate,...args],{encoding:'utf8',env:{PATH:process.env.PATH,HOME:process.env.HOME,...env},timeout:10000});}
const plan=run(['--plan']);assert.equal(plan.status,0,plan.stderr);
const base={GROWTHOS_BACKUP_TEST_DISPOSABLE:'YES',GROWTHOS_BACKUP_SOURCE:source,GROWTHOS_BACKUP_DEST:dest,GROWTHOS_DB_HOST:'127.0.0.1',GROWTHOS_DB_PORT:'33079',GROWTHOS_DB_USER:'synthetic',GROWTHOS_DB_PASSWORD:'synthetic'};
const refusals=[
 [{},'disposable confirmation missing'],
 [{...base,GROWTHOS_BACKUP_DEST:source},'distinct growthos_test_*'],
 [{...base,GROWTHOS_BACKUP_DEST:'growthos_prod'},'distinct growthos_test_*'],
 [{...base,GROWTHOS_DB_HOST:'production.example.com'},'numeric loopback host required'],
 [{...base,GROWTHOS_PRODUCTION_APPROVAL:'YES'},'production approval flag forbidden']
];
for(const [env,message] of refusals){const result=run(['--rehearse'],env);assert.notEqual(result.status,0);assert.ok(result.stderr.includes(message),result.stderr);}
console.log('PASS: plan, '+refusals.length+' pre-connection refusals, '+(unsafe.length+1)+' dump refusals');
