'use strict';
// Offline, pinned-source assembly. No database connection or credential loader.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),vm=require('node:vm');
const {execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'../..');
const refs={primary:'8b0e2d9eb52eb184eb9ecc5ba5b2521eb0acf71d',database:'e5b2c9678bb57817ba6a18e0f85df681f8c4e8e6',backup:'3e7d7622cb672beb6025a146cae2396baa3cc063',quota:'bd4d08c36b4c2c0d2a909d42377be048e9779d47'};
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
function assert(v,m){if(!v)throw Error('REFUSED: '+m);}
function blob(ref,file){assert(Object.values(refs).includes(ref)&&/^[a-zA-Z0-9_./-]+$/.test(file)&&!file.includes('..'),'source identity');return execFileSync('git',['show',ref+':'+file],{cwd:root,maxBuffer:4*1024*1024,stdio:['ignore','pipe','pipe']});}
function loadSources(){
 const manifest=JSON.parse(fs.readFileSync(path.join(root,'database/proposals/unified-v2/source-lock.json'),'utf8'));
 const sources={};for(const entry of manifest.sources){const bytes=blob(refs[entry.ref],entry.path);assert(sha(bytes)===entry.sha256,'source hash '+entry.path);sources[entry.path]=bytes;}
 const candidate='database/proposals/010_content_persistence_candidate.sql';
 // Run unchanged pinned pure package builders with a read-only view of the pinned 010 blob.
 const readFs={...fs,readFileSync:(file,...args)=>path.resolve(file)===path.join(root,candidate)?(args[0]==='utf8'?sources[candidate].toString():sources[candidate]):fs.readFileSync(file,...args)};
 function compile(file,extra){const module={exports:{}};const requirePinned=name=>name==='node:fs'?readFs:extra&&extra[name]?extra[name]:require(name);vm.runInNewContext(sources[file].toString(),{require:requirePinned,module,exports:module.exports,__dirname:path.join(root,'scripts/lib'),Buffer,console},{filename:file,timeout:5000});return module.exports;}
 const pkg=compile('scripts/lib/content-certification-package.cjs');
 const backup=compile('scripts/lib/expanded-backup-v1.cjs',{'./content-certification-package.cjs':pkg});
 return {pkg,backup,manifest,sources};
}
function framed(sql){const parts=sql.split('-- @statement\n').slice(1).map(x=>x.replace(/\nDELIMITER ;\n$/,'').trim());assert(parts.length&&parts.every(s=>s.endsWith('//')),'candidate framing');return parts.map(s=>s.slice(0,-2));}
function verifyCandidate(bytes,expectedHash){assert(Buffer.isBuffer(bytes)&&sha(bytes)===expectedHash,'candidate reviewed hash');return framed(bytes.toString('utf8'));}
function splitFields(body){const result=[];let start=0,depth=0,quote=null;for(let i=0;i<body.length;i++){const c=body[i];if(quote){if(c===quote&&body[i-1]!=='\\')quote=null;}else if(c==="'"||c==='"'||c==='`')quote=c;else if(c==='(')depth++;else if(c===')')depth--;else if(c===','&&depth===0){result.push(body.slice(start,i).trim());start=i+1;}}assert(!quote&&depth===0,'unbalanced DDL');result.push(body.slice(start).trim());return result;}
function inventory(ddl){
 const tables=[];for(const sql of ddl){const t=sql.match(/^CREATE TABLE (\w+)\s*\(([\s\S]*)\) ENGINE=InnoDB/);if(!t)continue;const columns=[],indexes=[],foreignKeys=[];
 for(const field of splitFields(t[2])){let m;if((m=field.match(/^(?:CONSTRAINT (\w+) )?FOREIGN KEY\s*\(([^)]+)\)\s+REFERENCES (\w+)\s*\(([^)]+)\)/)))foreignKeys.push({name:m[1]||null,columns:m[2].split(',').map(x=>x.trim()),parent:m[3],parentColumns:m[4].split(',').map(x=>x.trim())});else if((m=field.match(/^(PRIMARY KEY|UNIQUE KEY (\w+)|KEY (\w+))\s*\(([^)]+)\)/)))indexes.push({name:m[2]||m[3]||'PRIMARY',unique:!m[3],columns:m[4].split(',').map(x=>x.trim())});else if(!/^(CONSTRAINT|CHECK)\b/.test(field)){const c=field.match(/^(\w+)\s+(.+)/s);assert(c,'column syntax');columns.push({name:c[1],definition:c[2]});if(/\bPRIMARY KEY\b/.test(field))indexes.push({name:'PRIMARY',unique:true,columns:[c[1]]});else if(/\bUNIQUE\b/.test(field))indexes.push({name:c[1],unique:true,columns:[c[1]]});}}
 tables.push({name:t[1],columns,indexes,foreignKeys,collation:/COLLATE=(\w+)/.exec(sql)?.[1]||'inherited:utf8mb4_uca1400_ai_ci',rowFormat:/ROW_FORMAT=(\w+)/.exec(sql)?.[1]||'server default'});
 }
 for(const sql of ddl){const m=sql.match(/^ALTER TABLE (\w+) ADD UNIQUE KEY (\w+) \(([^)]+)\)/);if(m)tables.find(t=>t.name===m[1]).indexes.push({name:m[2],unique:true,columns:m[3].split(',')});}
 const triggers=ddl.filter(s=>s.startsWith('CREATE TRIGGER')).map(sql=>{const m=sql.match(/^CREATE TRIGGER (\w+)\s+BEFORE (\w+) ON (\w+)/);assert(m,'trigger syntax');return {name:m[1],event:m[2],table:m[3],sha256:sha(sql)};});
 for(const t of tables)for(const f of t.foreignKeys){const p=tables.find(x=>x.name===f.parent);assert(p&&f.parentColumns.length===f.columns.length&&f.columns.every(c=>t.columns.some(x=>x.name===c))&&f.parentColumns.every(c=>p.columns.some(x=>x.name===c)),'FK columns '+t.name);}
 return {tables,triggers,fkColumns:tables.flatMap(t=>t.foreignKeys).reduce((n,f)=>n+f.columns.length,0)};
}
function contract(){const loaded=loadSources(),old=loaded.backup.schemaContract();const source011=fs.readFileSync(path.join(root,'database/proposals/011_authorization_trust_candidate.sql'));assert(sha(source011)===loaded.manifest.sha011,'011 reviewed hash');const source012=fs.readFileSync(path.join(root,'database/proposals/unified-v2/012_quota_v2_candidate.sql'));assert(sha(source012)===loaded.manifest.sha012,'012 reviewed hash');
 const ddl=[...old.ddl,...verifyCandidate(source011,loaded.manifest.sha011),...verifyCandidate(source012,loaded.manifest.sha012)];const model=inventory(ddl);const ledger=[...old.ledger,['011_authorization_trust_candidate.sql',sha(source011)],['012_quota_v2_candidate.sql',sha(source012)]];
 assert(model.tables.length===31&&model.triggers.length===35&&model.fkColumns===114&&ledger.length===12,'unified inventory');
 const result={format:'growthos-unified-schema-review-v2',refs,baselineBackupHash:old.contractHash,ddl,ledger,...model};const contractHash=sha(JSON.stringify(result));assert(contractHash==='5b810bd2981ee4ef527e35de6704f9c0ce3969138541009023d43b25563a9b62','independent reviewed contract hash');return {...result,contractHash,runtimeCertified:false,installationAuthorized:false};}
function preflight(env,version){loadSources().pkg.preflight(env,version);assert(env.GROWTHOS_UNIFIED_CERT_DISPOSABLE==='YES','unified opt-in required');}
module.exports={root,refs,sha,assert,blob,loadSources,framed,verifyCandidate,splitFields,inventory,contract,preflight};
