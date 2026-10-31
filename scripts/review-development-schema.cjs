#!/usr/bin/env node
// Static review only. No database client, subprocess, network or SQL execution.
const fs=require('node:fs'),crypto=require('node:crypto'),path=require('node:path');
const paths={
 '010':'database/proposals/certification-010-016/010_content_persistence_candidate.sql',
 '011':'database/proposals/011_authorization_trust_candidate.sql',
 '012':'database/proposals/certification-010-016/012_quota_v2_candidate.sql',
 '013':'database/proposals/publication-funding-v1/013_publication_funding_jobs_candidate.sql',
 '014':'database/proposals/publication-observation-scope-v1/014_observation_scope_candidate.sql',
 '015':'database/proposals/product-authority-v1/015_product_authority_candidate.sql',
 '016':'database/proposals/recommendation-review-v1/016_recommendation_review_candidate.sql',
 '017':'database/proposals/session02-isolated-workflows/017_session02_disposable_candidate.sql',
 '018':'database/proposals/session03-isolated-runtime/018_session03_disposable_candidate.sql'};
function review(){const proposals={},owners=new Map();
 for(const [id,file] of Object.entries(paths)){
  const bytes=fs.readFileSync(path.join(__dirname,'..',file)),sql=bytes.toString('utf8').split('\n').filter(line=>!line.trim().startsWith('--')).join('\n');
  const tables=[...sql.matchAll(/CREATE TABLE\s+(\w+)/gi)].map(m=>m[1]),references=[...new Set([...sql.matchAll(/REFERENCES\s+(\w+)/gi)].map(m=>m[1]))];
  for(const table of tables)owners.set(table,[...(owners.get(table)||[]),id]);
  proposals[id]={file,sha256:crypto.createHash('sha256').update(bytes).digest('hex'),tables,references,alters:[...new Set([...sql.matchAll(/ALTER TABLE\s+(\w+)/gi)].map(m=>m[1]))],foreignKeys:[...sql.matchAll(/FOREIGN KEY/gi)].length,checks:[...sql.matchAll(/CHECK\s*\(/gi)].length};
 }
 return {mode:'STATIC_ONLY_NO_SQL_EXECUTED',proposals,nameCollisions:[...owners].filter(([,ids])=>ids.length>1).map(([table,ids])=>({table,ids})),
 semanticOverlaps:[{candidate:'010',isolated:'017/018',concern:'connector health; synthetic health must never be promoted as trusted live evidence'},
 {candidate:'013',isolated:'017/018',concern:'publication jobs versus manual analysis leases; execution authority and billing scopes differ'},
 {candidate:'015',isolated:'017',concern:'research evidence; manual input provenance is not verified issuer evidence'},
 {candidate:'016',isolated:'017/018',concern:'recommendation review and revocation; internal queue approval is not production authority'}]};
}
module.exports={review};if(require.main===module)console.log(JSON.stringify(review(),null,2));
