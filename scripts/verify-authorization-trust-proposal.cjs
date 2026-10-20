'use strict';
const fs=require('node:fs');const path=require('node:path');const crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');
const sqlPath=path.join(root,'database/proposals/011_authorization_trust_candidate.sql');
const manifestPath=path.join(root,'database/proposals/011_authorization_trust_manifest.json');
function inventory(sql){
 const tables=[...sql.matchAll(/CREATE TABLE (\w+) \(([\s\S]+?)\) ENGINE=InnoDB/g)].map(m=>m[1]);
 const triggers=[...sql.matchAll(/CREATE TRIGGER (\w+) BEFORE (UPDATE|DELETE|INSERT) ON (\w+)/g)].map(m=>({name:m[1],event:m[2],table:m[3]}));
 const foreignKeys=[...sql.matchAll(/CONSTRAINT (\w+) FOREIGN KEY \(([^)]+)\) REFERENCES (\w+)\(([^)]+)\)/g)].map(m=>({name:m[1],columns:m[2].split(','),parent:m[3],parentColumns:m[4].split(',')}));
 const indexes=[];
 for(const m of sql.matchAll(/CREATE TABLE (\w+) \(([\s\S]+?)\) ENGINE=InnoDB/g))for(const k of m[2].matchAll(/(PRIMARY KEY|UNIQUE KEY (\w+)|(?<!UNIQUE )KEY (\w+)) \(([^)]+)\)/g))indexes.push({table:m[1],name:k[2]||k[3]||'PRIMARY',unique:!k[3],columns:k[4].split(',')});
 return {tables,triggers,foreignKeys,indexes,fkColumns:foreignKeys.reduce((n,f)=>n+f.columns.length,0)};
}
function verify(sql=fs.readFileSync(sqlPath,'utf8'),manifest=JSON.parse(fs.readFileSync(manifestPath,'utf8'))){
 const sha=crypto.createHash('sha256').update(sql).digest('hex');
 if(manifest.format!=='growthos-authorization-trust-review-v1'||manifest.requires010Sha256!=='bb10b32ec0186399ae10b1820541d4330aab500843cd0fcf2a82b4da515c2c5b'||sha!==manifest.sha256)throw Error('PROPOSAL_HASH_MISMATCH');
 const actual=inventory(sql);if(JSON.stringify(actual)!==JSON.stringify(manifest.inventory))throw Error('PROPOSAL_INVENTORY_MISMATCH');
 for(const table of sql.matchAll(/CREATE TABLE (\w+) \(([\s\S]+?)\) ENGINE=InnoDB/g))for(const fk of table[2].matchAll(/FOREIGN KEY \(([^)]+)\)/g)){const fields=fk[1].split(',');if(!actual.indexes.some(i=>i.table===table[1]&&fields.every((f,n)=>i.columns[n]===f)))throw Error('FK_INDEX_UNDECLARED');}
 const chunks=sql.split('-- @statement\n').slice(1).map(x=>x.split('//')[0].trim());
 if(chunks.length!==25||chunks.some(x=>!/^CREATE (TABLE|TRIGGER) [a-z_]+/.test(x))||actual.tables.length!==8||actual.triggers.length!==17||actual.indexes.length!==29||actual.foreignKeys.some(f=>f.columns.length!==f.parentColumns.length))throw Error('PROPOSAL_GRAMMAR_INVALID');
 if(!sql.startsWith('-- REVIEW ONLY:')||!sql.endsWith('DELIMITER ;\n'))throw Error('PROPOSAL_FRAMING_INVALID');
 return {status:'OFFLINE_REVIEW_CONTRACT_PASS',installationAuthorized:false,runtimeCertified:false,sha256:sha,additions:{tables:8,triggers:17,fkColumns:actual.fkColumns},plannedInventoryAfter010:{tables:28,triggers:28,fkColumns:40+actual.fkColumns,ledgerEntries:11},inventory:actual};
}
module.exports={verify,inventory};
if(require.main===module){try{if(process.argv.length!==2)throw Error('NO_EXECUTION_ARGUMENTS_ALLOWED');process.stdout.write(JSON.stringify(verify(),null,2)+'\n');}catch(e){process.stderr.write('REFUSED: '+e.message+'; no database access\n');process.exitCode=2;}}
