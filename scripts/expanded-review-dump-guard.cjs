'use strict';
/** Restricted review-v1 dump grammar. No client, SQL or database invocation. */
const crypto=require('node:crypto');const {TextDecoder}=require('node:util');
const {expected,validate}=require('./verify-review-recovery-manifest-offline.cjs');
const {statements}=require('./disposable-candidate-installer.cjs');
function validateDump(bytes,manifest,trustedDigest){
 if(!Buffer.isBuffer(bytes)||bytes.length===0||bytes.length>256*1024*1024||
   !/^[0-9a-f]{64}$/.test(trustedDigest||''))throw Error('BACKUP_SIZE_OR_TRUST_DIGEST_INVALID');
 validate(manifest);
 if(crypto.createHash('sha256').update(bytes).digest('hex')!==trustedDigest)throw Error('BACKUP_BYTES_CORRUPT');
 let sql;try{sql=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{throw Error('BACKUP_INVALID_UTF8');}
 if(/\/\*|(?:^|\n)\s*(?:--|#|\\|SOURCE\b|\.\s)/im.test(sql))throw Error('BACKUP_COMMENT_OR_CLIENT_DIRECTIVE');
 // The only supported delimiter directives are the pinned syntax for trigger bodies.
 if(/\bDELIMITER\b/i.test(sql.replace(/^DELIMITER\s+(?:\/\/|;)\s*$/gm,'')))throw Error('BACKUP_CLIENT_DIRECTIVE');
 const all=statements(sql);const x=expected();const tables=new Set(),triggers=new Set();
 for(const statement of all){
  const table=statement.match(/^CREATE TABLE\s+`?([a-z_][a-z_0-9]*)`?\s*\(/i);
  const trigger=statement.match(/^CREATE TRIGGER\s+`?([a-z_][a-z_0-9]*)`?\s+BEFORE\s+(?:INSERT|UPDATE|DELETE)\s+ON\s+`?([a-z_][a-z_0-9]*)`?\s+FOR EACH ROW\b/i);
  const insert=statement.match(/^INSERT INTO\s+`?([a-z_][a-z_0-9]*)`?\s+(?:\([a-z_0-9`,\s]+\)\s+)?VALUES\s*\(/i);
  if(table){if(!x.tables.includes(table[1])||tables.has(table[1])||
      !/\bENGINE=InnoDB\b/i.test(statement))throw Error('BACKUP_UNEXPECTED_TABLE');tables.add(table[1]);continue;}
  if(trigger){if(!x.triggers.includes(trigger[1])||!x.tables.includes(trigger[2])||triggers.has(trigger[1]))
      throw Error('BACKUP_UNEXPECTED_TRIGGER');triggers.add(trigger[1]);continue;}
  if(insert){if(!x.tables.includes(insert[1])||!tables.has(insert[1])||
      /\b(?:SELECT|LOAD|OUTFILE|INFILE)\b/i.test(statement))throw Error('BACKUP_UNSAFE_INSERT');continue;}
  throw Error('BACKUP_UNSUPPORTED_SQL');
 }
 if(tables.size!==44||triggers.size!==60)throw Error('BACKUP_TRUNCATED_OR_PARTIAL');
 return {status:'RESTRICTED_DUMP_SHAPE_ONLY',tables:44,triggers:60,restoreAuthorized:false};
}
module.exports={validateDump};
