'use strict';
/** Static manifest gate only. Does not inspect, restore or create a dump. */
const fs=require('node:fs');const path=require('node:path');const crypto=require('node:crypto');
const {verify}=require('./verify-review-migration-chain-offline.cjs');
const root=path.resolve(__dirname,'..');
const baselineHashes=[
 'b67ab03511cd972ee07f7e891d35134e84c0e0ac00ff8f27614f5fcf479108c6',
 '2b5d77e9120b23debd57f39439ceee3fafee7b46c1c5c26c22c1597aebddab2e',
 'c2bcabc28b3c26827ea0e1f5e01b6e6c0ce0c7d9797f6c5ed9c4c60150b0b4c7',
 '4bf0afc1e375720abaadf5b3bc282ed0b7d5c83cd56e58f37b3b557133f1c179',
 '4c020458375497ba0808a65ac76baaa839c13697de054608f5c42556ad14919b',
 '763ee4dd6b9461a799bffc1f314bc0ff69bc6dd84a52f9e96841342051f01019',
 '8f4fd143f23761e62f381cfcb736efe9380159bb786be07f46e9cee3d28add6f',
 '7ad741a87d29157ed1236aacd9daef1f855b5c38f2351bb5e5cf9e305502c672',
 'b8d26a4f7f9ce93407d3a3a5c63415bf3ca32a1843275ef5a3b99ba8ff15285c'
];
function expected(){
 const chain=verify();const dir=path.join(root,'database/mysql');
 const baseline=fs.readdirSync(dir).filter(name=>/^00[1-9]_.*\.sql$/.test(name)).sort();
 if(baseline.length!==9)throw Error('BASELINE_INVENTORY_MISMATCH');
 const ledger=baseline.map((name,i)=>{
  if(crypto.createHash('sha256').update(fs.readFileSync(path.join(dir,name))).digest('hex')!==baselineHashes[i])
   throw Error('BASELINE_HASH_MISMATCH');
  return [name,baselineHashes[i]];
 });
 ledger.push(...chain.candidateFilesVerified.map(x=>[x.number+'_'+path.basename(x.file).slice(4),x.sha256]));
 const tables=new Set(['growth_schema_migrations']);
 for(const name of baseline)for(const [,table] of fs.readFileSync(path.join(dir,name),'utf8').matchAll(/\bCREATE TABLE\s+(\w+)/g))tables.add(table);
 for(const candidate of chain.candidateFilesVerified)for(const table of candidate.tables)tables.add(table);
 const triggers=new Set(['approval_audit_update_guard','approval_audit_delete_guard',
  'growth_feature_audit_no_update','growth_feature_audit_no_delete']);
 for(const candidate of chain.candidateFilesVerified)for(const trigger of candidate.triggers)triggers.add(trigger);
 if(tables.size!==44||triggers.size!==60||ledger.length!==16)throw Error('RECOVERY_INVENTORY_MISMATCH');
 return {ledger:Object.fromEntries(ledger),tables:[...tables].sort(),triggers:[...triggers].sort()};
}
function validate(manifest){
 const x=expected();
 if(!manifest||!/^growthos_test_[a-z0-9_]{4,40}$/.test(manifest.schema)||
  manifest.version!=='review-010-016-v1'||
  JSON.stringify(manifest.ledger)!==JSON.stringify(x.ledger)||
  JSON.stringify(manifest.triggers)!==JSON.stringify(x.triggers)||
  !manifest.tableContent||JSON.stringify(Object.keys(manifest.tableContent).sort())!==JSON.stringify(x.tables))
  throw Error('RECOVERY_MANIFEST_SCOPE_OR_INVENTORY_MISMATCH');
 for(const value of Object.values(manifest.tableContent))if(!value||!Number.isSafeInteger(value.rows)||value.rows<0||
   !/^[0-9a-f]{64}$/.test(value.sha256))throw Error('RECOVERY_CONTENT_HASH_INVALID');
 return {status:'STATIC_MANIFEST_MATCH_ONLY',liveRestoreCertified:false};
}
module.exports={expected,validate};
