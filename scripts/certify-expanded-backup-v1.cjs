#!/usr/bin/env node
'use strict';
// Separate expanded archive v1 rehearsal. Creates only owned disposable Docker resources. No caller database/credential path exists.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {spawnSync}=require('node:child_process');
const {root,assert,verifyPackage,preflight,verifyContainer}=require('./lib/content-certification-package.cjs');
function main(){
 const mode=process.argv[2];assert(process.argv.length===3&&['--plan','--run'].includes(mode),'only --plan or --run supported');
 const pkg=verifyPackage();const expanded=require('./lib/expanded-backup-v1.cjs').schemaContract();
 if(mode==='--plan'){console.log(JSON.stringify({status:'EXPANDED_BACKUP_V1_PLAN_ONLY',databaseExecuted:false,format:expanded.format,contractHash:expanded.contractHash,ddlStatements:expanded.ddl.length,tables:expanded.tables.map(t=>t.name),triggers:expanded.triggers,ledger:expanded.ledger}));return;}
 preflight(process.env,process.versions.node);
 require.resolve('mysql2/promise');require.resolve('tsx');
 const imageRef=process.env.GROWTHOS_CERT_MARIADB_IMAGE;
 const nonce=crypto.randomBytes(12).toString('hex'),name='growthos-cert-'+nonce,networkName=name+'-net';
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'growthos-db-cert-'));fs.chmodSync(temp,0o700);
 const rootPassword=crypto.randomBytes(32).toString('hex');const envFile=path.join(temp,'synthetic.env');
 fs.writeFileSync(envFile,'MARIADB_ROOT_PASSWORD='+rootPassword+'\nMARIADB_ROOT_HOST=%\n',{mode:0o600,flag:'wx'});
 const base=['--host','unix:///var/run/docker.sock','--config',path.join(temp,'docker')];
 function docker(args,parse=false){const r=spawnSync('docker',[...base,...args],{encoding:'utf8',timeout:60000,maxBuffer:1048576,env:{PATH:process.env.PATH}});assert(!r.error&&r.status===0,'local Docker operation failed: '+args[0]+' '+(args[1]||''));return parse?JSON.parse(r.stdout):r.stdout.trim();}
 let networkCreated=false,containerId;
 try {
  const image=docker(['image','inspect',imageRef],true)[0]; // Local only; never pulls.
  docker(['network','create','--internal','--label','com.growthos.certification='+nonce,networkName]);networkCreated=true;
  containerId=docker(['run','--detach','--pull=never','--name',name,'--label','com.growthos.certification='+nonce,'--network',networkName,'--tmpfs','/var/lib/mysql:rw,nosuid,nodev','--publish','127.0.0.1::3306','--env-file',envFile,imageRef,'--bind-address=0.0.0.0']);
  const container=docker(['container','inspect',containerId],true)[0];
  const network=docker(['network','inspect',networkName],true)[0];
  const port=verifyContainer(container,network,image,{name,networkName,nonce,imageRef});
  const config={host:'127.0.0.1',port,password:rootPassword,db:'growthos_test_cert_'+nonce,containerHostname:container.Config.Hostname,synthetic:true,containerId,name,networkName,nonce,imageRef,configDir:path.join(temp,'docker')};
  // Configuration travels only through stdin. No secret command arguments or credential files persist.
  const worker=spawnSync(process.execPath,['--import=tsx',path.join(root,'scripts/expanded-backup-v1-mariadb-tests.ts')],{cwd:root,input:JSON.stringify(config),encoding:'utf8',timeout:180000,maxBuffer:4*1024*1024,env:{PATH:process.env.PATH,GROWTHOS_CERT_WORKER:'OWNED_DISPOSABLE_STDIN'}});
  if(worker.stdout)process.stdout.write(worker.stdout);
  assert(!worker.error&&worker.status===0,'live worker failed; no live PASS recorded');
 } finally {
  // Delete only the exact resources created by this process; no schemas outside this container exist in this harness.
  if(containerId)docker(['container','rm','--force',containerId]);
  if(networkCreated)docker(['network','rm',networkName]);
  fs.rmSync(temp,{recursive:true,force:true});
 }
}
try{main();}catch(error){console.error(error.message.startsWith('REFUSED:')?error.message:'BLOCKED: certification dependency or execution failed');process.exitCode=2;}
