#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const review=require('./lib/unified-schema-review-v2.cjs');
try{
 review.assert(process.argv.length===3&&['--plan','--run'].includes(process.argv[2]),'only --plan or --run');
 if(process.argv[2]==='--run')review.assert(/^22\./.test(process.versions.node),'Node.js 22 required; no infrastructure or database access attempted');
 const model=review.contract();const saved=JSON.parse(fs.readFileSync(path.join(review.root,'database/proposals/unified-v2/inventory.json'),'utf8'));const {ddl,...inventory}=model;review.assert(JSON.stringify(saved)===JSON.stringify(inventory),'committed inventory drift');
 if(process.argv[2]==='--plan')console.log(JSON.stringify({status:'OFFLINE_PLAN_PASS',runtime:process.version,contractHash:model.contractHash,expected:{tables:model.tables.length,triggers:model.triggers.length,fkColumns:model.fkColumns,ledgerEntries:model.ledger.length},databaseExecuted:false,installationAuthorized:false},null,2));
 else {
  review.preflight(process.env,process.versions.node);
  const loaded=review.loadSources();
  // Reuse the unchanged, hash-pinned isolated supervisor; redirect ONLY its worker path.
  const worker='scripts/unified-schema-v2-mariadb-tests.cjs';const routedPath={...path,join:(...args)=>args.length===2&&args[0]===review.root&&args[1]==='scripts/content-persistence-mariadb-tests.ts'?path.join(review.root,worker):path.join(...args)};
  const module={exports:{}};vm.runInNewContext(loaded.sources['scripts/certify-content-persistence.cjs'].toString(),{require:n=>n==='./lib/content-certification-package.cjs'?loaded.pkg:n==='node:path'?routedPath:require(n),module,exports:module.exports,process,console,Buffer,__dirname:path.join(review.root,'scripts')},{filename:'pinned-isolated-supervisor.cjs'});
 }
}catch(e){console.error(e.message);process.exitCode=2;}
