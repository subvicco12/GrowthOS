#!/usr/bin/env node
'use strict';
/** Offline-only gate. It never opens a database, installs SQL, restores an archive or authorizes a test. */
const {readFileSync}=require('node:fs');
const {createHash}=require('node:crypto');
const {spawnSync}=require('node:child_process');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const pins=Object.freeze({
 '010':['external','bb10b32ec0186399ae10b1820541d4330aab500843cd0fcf2a82b4da515c2c5b'],
 '011':['database/proposals/011_authorization_trust_candidate.sql','7b9f5b15d2797c13bc6c30d04a08d49b5112a2545f264b543e86ffd5b303362a'],
 '012':['external','6d32ff6a950e9e90c40a4c5e5892c783914847c0f518faab980f08764bc310a6'],
 '013':['database/proposals/publication-funding-v1/013_publication_funding_jobs_candidate.sql','049f16c9c9eb9336c60b9d3ebf42d5f66763257146d4d99714b0f74e7aea481e'],
 '014':['database/proposals/publication-observation-scope-v1/014_observation_scope_candidate.sql','d341bb3bc004b332f7cbc8253c2e5eb5255a4b8120860ae5d453f87762ee71b8']
});
const schema=s=>typeof s==='string'&&/^growthos_test_[a-z0-9_]{1,48}$/.test(s);
function options(args){
 const parsed={};
 for(const arg of args){const m=/^--(candidate-010|candidate-012|source-schema|destination-schema|host)=(.+)$/.exec(arg);if(!m||Object.hasOwn(parsed,m[1]))throw Error('PREFLIGHT_ARGUMENT_DENIED');parsed[m[1]]=m[2];}
 if(!parsed['candidate-010']||!parsed['candidate-012']||!schema(parsed['source-schema'])||!schema(parsed['destination-schema'])||parsed['source-schema']===parsed['destination-schema']||parsed.host!=='127.0.0.1')throw Error('DISPOSABLE_IDENTITY_REQUIRED');
 return parsed;
}
function checkPins(o,read=readFileSync){
 const hashes={};for(const [number,[file,pin]] of Object.entries(pins)){
  const input=file==='external'?o['candidate-'+number]:path.join(root,file);
  const actual=createHash('sha256').update(read(input)).digest('hex');
  if(actual!==pin)throw Error('CANDIDATE_'+number+'_HASH_MISMATCH');hashes[number]=actual;
 }
 return hashes;
}
function probe(command,args){const r=spawnSync(command,args,{encoding:'utf8',timeout:5000,env:{PATH:process.env.PATH||''}});return r.error||r.status!==0?'unavailable':(r.stdout||r.stderr).trim().split('\n')[0];}
function assess({nodeVersion,serverVersion,clientVersion,dumpVersion}){
 const runtime=/^v22\./.test(nodeVersion)&&/11\.8\./.test(serverVersion)&&/11\.8\./.test(clientVersion)&&/11\.8\./.test(dumpVersion);
 return {status:runtime?'ISOLATION_REVIEW_REQUIRED':'BLOCKED_RUNTIME',liveTestsExecuted:false,sqlAuthorized:false};
}
if(require.main===module){
 try{
  const o=options(process.argv.slice(2)),hashes=checkPins(o);
  const versions={node:process.version,mariadbd:probe('mariadbd',['--no-defaults','--version']),mariadb:probe('mariadb',['--no-defaults','--version']),mariadbDump:probe('mariadb-dump',['--no-defaults','--version'])};
  const result=assess({nodeVersion:versions.node,serverVersion:versions.mariadbd,clientVersion:versions.mariadb,dumpVersion:versions.mariadbDump});
  process.stdout.write(JSON.stringify({...result,hashes,versions,host:o.host,schemas:[o['source-schema'],o['destination-schema']],required:'Independent process/network isolation, empty disposable schemas, synthetic-only credentials, two sessions, current trust anchor, reviewed 010-014 installation and explicit test authorization.'},null,2)+'\n');
  process.exitCode=2; // Even matching versions never prove database isolation.
 }catch(error){process.stderr.write('REFUSED: '+error.message+'\n');process.exitCode=2;}
}
module.exports={options,checkPins,assess,pins};
