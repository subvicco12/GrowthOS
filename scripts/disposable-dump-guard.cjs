'use strict';
function validateDump(bytes,source,dest){
 const refuse=message=>{throw Error('REFUSED: '+message);};
 const sql=bytes.toString('utf8');
 if(!sql||sql.includes('\ufffd'))refuse('empty or invalid UTF-8 dump');
 if(sql.toLowerCase().includes(source.toLowerCase()))refuse('dump references the source schema');
 // Fail closed even if a client directive is wrapped in an executable comment.
 if(/\b(?:DATABASE|SCHEMA)\b/i.test(sql))refuse('database-level DDL or directive in dump');
 if(/\bUSE\b/i.test(sql))refuse('database switch in dump');
 if(/^\s*\\/m.test(sql))refuse('client command in dump');
 if(/\b(?:CREATE\s+(?:TABLE|TRIGGER)|INSERT\s+INTO|REPLACE\s+INTO|UPDATE|DELETE\s+FROM|REFERENCES|LOCK\s+TABLES)\s+`?\w+`?\s*\./i.test(sql))refuse('qualified schema reference in dump');
 if(sql.toLowerCase().includes('`'+dest.toLowerCase()+'`.')||sql.toLowerCase().includes(dest.toLowerCase()+'.'))refuse('qualified destination reference in dump');
}
module.exports={validateDump};
