const assert=require('node:assert/strict');const crypto=require('node:crypto');
const {expected}=require('./verify-review-recovery-manifest-offline.cjs');
const {validateDump}=require('./expanded-review-dump-guard.cjs');
const x=expected();const digest='a'.repeat(64);
const manifest={schema:'growthos_test_restore_01',version:'review-010-016-v1',ledger:x.ledger,triggers:x.triggers,
 tableContent:Object.fromEntries(x.tables.map(table=>[table,{rows:0,sha256:digest}]))};
const text=[...x.tables.map(name=>`CREATE TABLE ${name} (id INT) ENGINE=InnoDB;`),
 ...x.triggers.map(name=>`CREATE TRIGGER ${name} BEFORE UPDATE ON growth_users FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='IMMUTABLE';`)].join('\n');
const bytes=Buffer.from(text),hash=b=>crypto.createHash('sha256').update(b).digest('hex');
assert.equal(validateDump(bytes,manifest,hash(bytes)).restoreAuthorized,false);
for(const mutation of [text+'\nDROP TABLE growth_users;',text+'\nUSE production;',text+'\nCREATE DATABASE bad;',
 text+'\n/*!50000 SET FOREIGN_KEY_CHECKS=0 */;',text+'\nDELIMITER $$',text+'\nSOURCE /tmp/file',
 text.replace('ENGINE=InnoDB','ENGINE=MyISAM'),text.replace('CREATE TABLE growth_users','CREATE TABLE production.growth_users'),
 text.slice(0,-110)]){
 const b=Buffer.from(mutation);assert.throws(()=>validateDump(b,manifest,hash(b)));
}
assert.throws(()=>validateDump(bytes,manifest,'b'.repeat(64)),/BACKUP_BYTES_CORRUPT/);
console.log('PASS restricted expanded dump shape, corruption, unsafe SQL and truncation refusals; no restore');
