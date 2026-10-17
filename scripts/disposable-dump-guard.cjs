'use strict';
const {TextDecoder}=require('node:util');
const tables=new Set('growth_ai_reservations growth_approval_decisions growth_approval_queue growth_budget_incidents growth_content_policies growth_installation_state growth_login_throttles growth_memberships growth_organizations growth_organization_budgets growth_schema_migrations growth_sessions growth_users growth_websites growth_website_feature_audit'.split(' '));
const triggers=new Map([
 ['approval_audit_update_guard',['growth_approval_decisions','UPDATE']],
 ['approval_audit_delete_guard',['growth_approval_decisions','DELETE']],
 ['growth_feature_audit_no_update',['growth_website_feature_audit','UPDATE']],
 ['growth_feature_audit_no_delete',['growth_website_feature_audit','DELETE']]
]);
function refuse(message){throw Error('REFUSED: '+message);}
function preprocess(bytes){
 let input;
 try{input=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{refuse('invalid UTF-8 dump');}
 if(!input.trim())refuse('empty dump');
 let output='',i=0,quote='';
 while(i<input.length){
  const ch=input[i],next=input[i+1];
  if(quote){
   output+=ch;i++;
   if(ch==='\\'&&i<input.length){output+=input[i++];continue;}
   if(ch===quote){if(input[i]===quote)output+=input[i++];else quote='';}
   continue;
  }
  if(ch==='\''||ch==='"'||ch==='`'){quote=ch;output+=ch;i++;continue;}
  if((ch==='-'&&next==='-'&&/\s/.test(input[i+2]||''))||ch==='#'){
   const end=input.indexOf('\n',i);i=end<0?input.length:end;output+=' ';continue;
  }
  if(ch==='/'&&next==='*'){
   const end=input.indexOf('*/',i+2);if(end<0)refuse('unterminated comment');
   const body=input.slice(i+2,end);
   if(/^M!999999\\- enable the sandbox mode\s*$/.test(body))output+=' ';
   else if(/^(?:!|M!)\d+\s/.test(body))output+=' '+body.replace(/^(?:!|M!)\d+\s/,'')+' ';
   else output+=' ';
   i=end+2;continue;
  }
  output+=ch;i++;
 }
 if(quote)refuse('unterminated quoted value');
 return output;
}
function splitStatements(sql){
 let delimiter=';',pending='',result=[];
 for(const line of sql.split('\n')){
  const directive=line.trim().match(/^DELIMITER\s+(;;|\/\/|;)$/i);
  if(directive){if(pending.trim())refuse('delimiter inside statement');delimiter=directive[1];continue;}
  if(/^DELIMITER\b/i.test(line.trim()))refuse('unknown delimiter');
  pending+=line+'\n';
  let start=0,quote='';
  for(let i=0;i<pending.length;i++){
   const c=pending[i];
   if(quote){if(c==='\\'){i++;continue;}if(c===quote){if(pending[i+1]===quote)i++;else quote='';}continue;}
   if(c==='\''||c==='"'||c==='`'){quote=c;continue;}
   if(pending.startsWith(delimiter,i)){const stmt=pending.slice(start,i).trim();if(stmt)result.push(stmt);i+=delimiter.length-1;start=i+1;}
  }
  pending=pending.slice(start);
 }
 if(pending.trim())refuse('incomplete SQL statement');
 return result;
}
function identifier(value){const m=value.match(/^(?:`([a-z_][a-z_0-9]*)`|([a-z_][a-z_0-9]*))$/i);if(!m)refuse('qualified or malformed identifier');return (m[1]||m[2]).toLowerCase();}
function validateValues(values){
 const token=/\s*('(?:\\.|''|[^'\\])*'|0x[0-9a-f]+|NULL|-?\d+(?:\.\d+)?|[(),])/iy;
 let index=0,state='open',rows=0;
 while(index<values.length){
  token.lastIndex=index;const match=token.exec(values);if(!match)refuse('unsafe insert expression');
  index=token.lastIndex;const value=match[1];
  if(state==='open'){if(value!=='(')refuse('malformed insert tuple');state='value';}
  else if(state==='value'){if(value==='('||value===')'||value===',')refuse('malformed insert tuple');state='separator';}
  else if(state==='separator'){if(value===',')state='value';else if(value===')'){rows++;state='rowSeparator';}else refuse('malformed insert tuple');}
  else if(state==='rowSeparator'){if(value!==',')refuse('malformed insert tuples');state='open';}
 }
 if(state!=='rowSeparator'||rows===0)refuse('incomplete insert tuple');
}
function validateDump(bytes,source,dest,expectedUser){
 if(!/^growthos_test_[A-Za-z0-9_]+$/.test(source)||!/^growthos_test_[A-Za-z0-9_]+$/.test(dest)||source===dest)refuse('invalid disposable identity');
 const parts=splitStatements(preprocess(bytes));
 const seenTables=new Set(),seenTriggers=new Set();
 for(const statement of parts){
  const s=statement.replace(/\s+/g,' ').trim();
  let m;
  if((m=s.match(/^CREATE TABLE\s+(`?[\w]+`?)\s*\(([\s\S]+)\)\s+ENGINE=InnoDB(?:\s+DEFAULT CHARSET=utf8mb4\s+COLLATE=utf8mb4_uca1400_ai_ci)?$/i))){
   const name=identifier(m[1]);if(!tables.has(name)||seenTables.has(name))refuse('unexpected or duplicate table');
   if(/\b(?:SELECT|PROCEDURE|FUNCTION|TRIGGER|OUTFILE|LOAD|DATABASE|SCHEMA)\b/i.test(m[2]))refuse('unsafe table definition');
   const allowedCalls=new Set(['CHECK','KEY','bigint','char','current_timestamp','enum','int','varchar','tinyint']);
   for(const call of m[2].matchAll(/\b([a-z_][a-z_0-9]*)\s*\(/gi))if(!allowedCalls.has(call[1])&&!allowedCalls.has(call[1].toLowerCase()))refuse('unreviewed table expression');
   for(const ref of m[2].matchAll(/\bREFERENCES\s+(`?[^\s(]+`?)/gi))identifier(ref[1]);
   seenTables.add(name);continue;
  }
  if((m=s.match(/^INSERT INTO\s+(`?[\w]+`?)\s+VALUES\s*(\([\s\S]+\))$/i))){if(!tables.has(identifier(m[1])))refuse('unexpected insert target');validateValues(m[2]);continue;}
  if((m=s.match(/^CREATE\s+(?:DEFINER\s*=\s*`([\w]+)`\s*@\s*`([\w.]+)`\s+)?TRIGGER\s+(`?[\w]+`?)\s+BEFORE\s+(UPDATE|DELETE)\s+ON\s+(`?[\w]+`?)\s+FOR EACH ROW\s+(?:BEGIN\s+)?SIGNAL SQLSTATE\s+'45000'\s+SET MESSAGE_TEXT\s*=\s*'[^']*'\s*;?\s*(?:END)?$/i))){
   if(m[1]&&(m[1]!==expectedUser||m[2]!=='127.0.0.1'))refuse('unexpected trigger definer');
   const name=identifier(m[3]),expected=triggers.get(name);if(!expected||seenTriggers.has(name)||expected[0]!==identifier(m[5])||expected[1]!==m[4].toUpperCase())refuse('unexpected trigger');seenTriggers.add(name);continue;
  }
  if(/^SET\s+/i.test(s)){
   const assignments=s.slice(4).match(/(?:'[^']*'|[^,])+/g)?.map(x=>x.trim())||[];
   const allowed=/^(?:@(?:OLD_(?:CHARACTER_SET_CLIENT|CHARACTER_SET_RESULTS|COLLATION_CONNECTION|TIME_ZONE|UNIQUE_CHECKS|FOREIGN_KEY_CHECKS|SQL_MODE|NOTE_VERBOSITY|SQL_NOTES)|saved_(?:cs_client|cs_results|col_connection|sql_mode))\s*=\s*@@(?:CHARACTER_SET_CLIENT|CHARACTER_SET_RESULTS|COLLATION_CONNECTION|TIME_ZONE|UNIQUE_CHECKS|FOREIGN_KEY_CHECKS|SQL_MODE|NOTE_VERBOSITY|SQL_NOTES)|(?:TIME_ZONE|UNIQUE_CHECKS|FOREIGN_KEY_CHECKS|SQL_MODE|NOTE_VERBOSITY|SQL_NOTES|character_set_client|character_set_results|collation_connection)\s*=\s*(?:'\+00:00'|'NO_AUTO_VALUE_ON_ZERO'|'IGNORE_SPACE,STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION'|0|utf8mb4|utf8mb4_unicode_ci|@(?:OLD_[A-Z_]+|saved_(?:cs_client|cs_results|col_connection|sql_mode)))|NAMES\s+utf8mb4)$/i;
   if(assignments.some(x=>!allowed.test(x)))refuse('arbitrary session change');continue;
  }
  refuse('unsupported or unsafe SQL statement');
 }
 if(seenTables.size!==15||seenTriggers.size!==4)refuse('incomplete dump inventory');
 return {statementCount:parts.length,tableCount:seenTables.size,triggerCount:seenTriggers.size};
}
module.exports={validateDump};
