#!/usr/bin/env node
'use strict';
const assert=require('node:assert/strict');
const {validateDump}=require('./disposable-dump-guard.cjs');
const {fixture}=require('./disposable-dump-fixture.cjs');
const source='growthos_test_source',dest='growthos_test_dest';
const valid=[
 '',
 "INSERT INTO `growth_users` VALUES (1);",
 "INSERT INTO `growth_users` VALUES (1),(2);",
 "INSERT INTO `growth_users` VALUES ('USE db; DROP DATABASE db;','an example source schema growthos_test_source');",
 "/*!40101 SET NAMES utf8mb4 */;",
 "DELIMITER ;;\n/*!50003 CREATE*/ /*!50017 DEFINER=`cert`@`127.0.0.1`*/ /*!50003 TRIGGER growth_feature_audit_no_delete BEFORE DELETE ON growth_website_feature_audit FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'immutable' */;;\nDELIMITER ;" // duplicate trigger: tested separately below
];
for(const sql of valid.slice(0,5))assert.doesNotThrow(()=>validateDump(fixture(sql),source,dest),sql);
const bad=[
 ['USE other_db;',/unsafe SQL/],
 ['/*!40101 USE other_db */;',/unsafe SQL/],
 ['CREATE DATABASE other_db;',/unsafe SQL/],
 ['ALTER SCHEMA other_db;',/unsafe SQL/],
 ['DROP DATABASE other_db;',/unsafe SQL/],
 ['CREATE /* hidden */ DATABASE other_db;',/unsafe SQL/],
 ['\\connect other_db',/incomplete|unsafe|client/],
 ['INSERT INTO other_db.growth_users VALUES (1);',/unsafe|identifier/],
 ['UPDATE other_db.growth_users SET id=2;',/unsafe/],
 ['DELETE FROM other_db.growth_users;',/unsafe/],
 ['DROP TABLE `growth_users`;',/unsafe/],
 ['CREATE FUNCTION x() RETURNS INT RETURN 1;',/unsafe/],
 ['CREATE PROCEDURE x() SELECT 1;',/unsafe/],
 ['SET GLOBAL FOREIGN_KEY_CHECKS=0;',/arbitrary session/],
 ['SET SQL_MODE=\'ANSI\';',/arbitrary session/],
 ['/*!50000 SET @x=1 */;',/arbitrary session/],
 ['SELECT 1 INTO OUTFILE \'/tmp/x\';',/unsafe/],
 ['DELIMITER $$',/unknown delimiter/],
 ['CREATE TABLE `other` (`id` int) ENGINE=InnoDB;',/unexpected/],
 ['CREATE TABLE `growth_users` (`id` int DEFAULT (SLEEP(1))) ENGINE=InnoDB;',/unreviewed table expression|unexpected/],
 ['INSERT INTO `growth_users` SELECT * FROM `growth_users`;',/unsafe/],
 ['INSERT INTO `growth_users` VALUES (SLEEP(1));',/unsafe insert expression/],
 ['CREATE EVENT x ON SCHEDULE EVERY 1 SECOND DO SELECT 1;',/unsafe/],
 ['CREATE VIEW x AS SELECT 1;',/unsafe/],
 ['CREATE TABLE `growth_users` (`id` INT) ENGINE=InnoDB; USE other_db;',/unexpected or duplicate|unsafe/],
 ["INSERT INTO `growth_users` VALUES ('unterminated);",/unterminated/],
 [valid[5],/unexpected trigger/]
];
for(const [sql,pattern] of bad)assert.throws(()=>validateDump(fixture(sql),source,dest),pattern,sql);
assert.throws(()=>validateDump(Buffer.from(fixture().toString().replace('`id` int NOT NULL','`id` int DEFAULT (SLEEP(1))')),source,dest),/unreviewed table expression/);
assert.throws(()=>validateDump(Buffer.from([0xff]),source,dest),/invalid UTF-8/);
assert.throws(()=>validateDump(Buffer.alloc(0),source,dest),/empty/);
assert.throws(()=>validateDump(fixture().subarray(0,40),source,dest),/incomplete|unterminated/);
console.log('PASS: '+5+' allowed, '+(bad.length+4)+' refused offline dump cases');
