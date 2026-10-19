#!/usr/bin/env node
'use strict';
// Package/refusal tests only; never imports mysql or exercises database semantics.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),os=require('node:os');
const {spawnSync}=require('node:child_process');
const c=require('./lib/content-certification-package.cjs');
const {validateDump}=require('./disposable-dump-guard.cjs');
let count=0;const pass=(name,fn)=>{fn();count++;console.log('PASS OFFLINE '+name);};
const env={GROWTHOS_CERT_DISPOSABLE:'YES',GROWTHOS_CERT_MARIADB_IMAGE:'mariadb@sha256:'+'a'.repeat(64)};
pass('independent pins and proposed inventory match',()=>{const p=c.verifyPackage();assert.equal(p.statements.length,13);assert.equal(p.newTables.length,5);assert.equal(p.migrations.length,9);});
pass('modified candidate is refused before SQL',()=>{const bytes=fs.readFileSync(path.join(c.root,'database/proposals/010_content_persistence_candidate.sql'));assert.throws(()=>c.candidateStatements(Buffer.concat([bytes,Buffer.from('\nSELECT 1;')])),/SHA-256 mismatch/);});
pass('runtime, opt-in, CI, endpoint, credentials and image refusals',()=>{
 assert.throws(()=>c.preflight(env,'24.19.0'),/Node.js 22/);c.preflight(env,'22.16.0'); // Pure input validation, not Node 22 execution.
 for(const patch of [{GROWTHOS_CERT_DISPOSABLE:''},{CI:'true'},{GITHUB_ACTIONS:'true'},{DOCKER_HOST:'tcp://remote'},{DOCKER_CONTEXT:'other'},{GROWTHOS_DB_PASSWORD:'synthetic_inherited_forbidden'},{GROWTHOS_PRODUCTION_APPROVAL:'YES'},{GROWTHOS_CERT_MARIADB_IMAGE:'mariadb:11.8'}])assert.throws(()=>c.preflight({...env,...patch},'22.16.0'),/REFUSED/);
});
const options={name:'owned',networkName:'private',nonce:'synthetic',imageRef:env.GROWTHOS_CERT_MARIADB_IMAGE};
const image={Id:'image-id',RepoDigests:[options.imageRef]};
const container={Id:'container-id',Name:'/owned',State:{Running:true},Config:{Image:options.imageRef,Labels:{'com.growthos.certification':'synthetic'}},Image:image.Id,Mounts:[],HostConfig:{Privileged:false,Binds:[],Devices:[],Tmpfs:{'/var/lib/mysql':'rw'},NetworkMode:'private'},NetworkSettings:{Networks:{private:{}},Ports:{'3306/tcp':[{HostIp:'127.0.0.1',HostPort:'33317'}]}}};
const network={Name:'private',Internal:true,Labels:{'com.growthos.certification':'synthetic'},Containers:{'container-id':{}}};
pass('owned tmpfs container on a private network and loopback port passes metadata check',()=>assert.equal(c.verifyContainer(container,network,image,options),33317));
pass('public networking, volumes, shared network, elevated capability and wrong provenance refuse',()=>{
 for(const mutate of [x=>{x.NetworkSettings.Ports['3306/tcp'][0].HostIp='0.0.0.0';},x=>{x.Mounts=[{Type:'bind'}];},x=>{x.HostConfig.Privileged=true;},x=>{x.HostConfig.CapAdd=['SYS_ADMIN'];},x=>{x.Config.Labels['com.growthos.certification']='other';},x=>{x.Image='other';},x=>{x.HostConfig.NetworkMode='host';}]){const bad=structuredClone(container);mutate(bad);assert.throws(()=>c.verifyContainer(bad,network,image,options),/REFUSED/);}
 assert.throws(()=>c.verifyContainer(container,{...network,Internal:false},image,options),/REFUSED/);
 assert.throws(()=>c.verifyContainer(container,{...network,Containers:{'container-id':{},other:{}}},image,options),/REFUSED/);
});
pass('certified dump guard refuses an expanded table without any client or connection',()=>assert.throws(()=>validateDump(Buffer.from('CREATE TABLE growth_content_records (id int) ENGINE=InnoDB;'),'growthos_test_src','growthos_test_dst','synthetic'),/unexpected or duplicate table/));
pass('CLI live mode refuses before any infrastructure process starts',()=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'growthos-cert-refusal-'));
 try{const hook=path.join(tmp,'no-spawn.cjs');fs.writeFileSync(hook,"require('node:child_process').spawnSync=()=>{throw Error('UNEXPECTED_INFRASTRUCTURE_ACCESS')};");
  const r=spawnSync(process.execPath,['-r',hook,path.join(c.root,'scripts/certify-content-persistence.cjs'),'--run'],{encoding:'utf8',env:{PATH:process.env.PATH}});
  assert.equal(r.status,2);assert.match(r.stderr,/REFUSED/);assert.doesNotMatch(r.stderr,/UNEXPECTED_INFRASTRUCTURE_ACCESS/);
 }finally{fs.rmSync(tmp,{recursive:true,force:true});}
});
console.log('PASS '+count+' grouped OFFLINE package/refusal checks; database certification NOT executed.');
