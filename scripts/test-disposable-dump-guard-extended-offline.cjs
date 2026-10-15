#!/usr/bin/env node
'use strict';
// Offline-only dump-guard regression tests. No DB, network, or credentials.
const assert=require('node:assert/strict');
const {validateDump}=require('./disposable-dump-guard.cjs');
const source='growthos_test_source',dest='growthos_test_dest';
const valid=[
 'CREATE TABLE `growth_users` (`id` INT) ENGINE=InnoDB;',
 'INSERT INTO `growth_users` VALUES (1);',
 'CREATE TRIGGER `audit_immutable` BEFORE DELETE ON `growth_audit` FOR EACH ROW SIGNAL SQLSTATE \'45000\';'
];
for(const sql of valid)assert.doesNotThrow(()=>validateDump(Buffer.from(sql),source,dest),sql);
const bad=[
 ['USE other_db;',/database switch/],
 ['/*!40101 USE other_db */;',/database switch/],
 ['CREATE DATABASE other_db;',/database-level/],
 ['ALTER SCHEMA other_db;',/database-level/],
 ['DROP DATABASE other_db;',/database-level/],
 ['CREATE /* hidden */ DATABASE other_db;',/database-level/],
 ['\\connect other_db',/client command/],
 ['INSERT INTO other_db.growth_users VALUES (1);',/qualified schema/],
 ['UPDATE other_db.growth_users SET id=2;',/qualified schema/],
 ['DELETE FROM other_db.growth_users;',/qualified schema/],
 ['CREATE TABLE other_db.growth_users (id INT);',/qualified schema/],
 ['CREATE TRIGGER other_db.t BEFORE DELETE ON growth_users FOR EACH ROW SET @x=1;',/qualified schema/],
 ['INSERT INTO `'+source+'`.`growth_users` VALUES (1);',/source schema/],
 ['INSERT INTO `'+dest+'`.`growth_users` VALUES (1);',/qualified/],
];
for(const [sql,pattern] of bad)assert.throws(()=>validateDump(Buffer.from(sql),source,dest),pattern,sql);
assert.throws(()=>validateDump(Buffer.from([0xff]),source,dest),/invalid UTF-8/);
assert.throws(()=>validateDump(Buffer.alloc(0),source,dest),/empty/);
console.log('PASS: '+valid.length+' allowed, '+(bad.length+2)+' refused offline dump cases');
