'use strict';
// Review-only archive contract. It deliberately has no database connection, SQL parser or restore executor.
const {createHash,timingSafeEqual,createHmac}=require('node:crypto');
const {TextDecoder}=require('node:util');
const {readFileSync,readdirSync}=require('node:fs');
const path=require('node:path');
const FORMAT='growthos-publication-recovery-v4-review';
const sha=s=>createHash('sha256').update(s).digest('hex');
const tables=`growth_ai_reservations growth_approval_decisions growth_approval_queue growth_budget_incidents growth_connector_attestations growth_connector_evidence_history growth_connector_health growth_connector_issuer_state growth_content_authorizations growth_content_events growth_content_policies growth_content_records growth_installation_state growth_login_throttles growth_memberships growth_organization_budgets growth_organizations growth_publication_authorization_events growth_publication_authorization_uses growth_publication_claims growth_publication_destinations growth_publication_funding_bindings growth_publication_job_events growth_publication_jobs growth_publication_observations growth_publication_policy_revisions growth_quota_events_v2 growth_quota_postings_v2 growth_quota_reservations_v2 growth_schema_migrations growth_sessions growth_users growth_website_feature_audit growth_websites`.split(' ');
const pins=['bb10b32ec0186399ae10b1820541d4330aab500843cd0fcf2a82b4da515c2c5b','7b9f5b15d2797c13bc6c30d04a08d49b5112a2545f264b543e86ffd5b303362a','6d32ff6a950e9e90c40a4c5e5892c783914847c0f518faab980f08764bc310a6','049f16c9c9eb9336c60b9d3ebf42d5f66763257146d4d99714b0f74e7aea481e','d341bb3bc004b332f7cbc8253c2e5eb5255a4b8120860ae5d453f87762ee71b8'];
const schema=s=>typeof s==='string'&&/^growthos_test_[a-z0-9_]{1,48}$/.test(s);
const assert=(v,msg)=>{if(!v)throw Error('REFUSED: '+msg);};
const exact=(o,keys)=>o&&typeof o==='object'&&!Array.isArray(o)&&JSON.stringify(Object.keys(o).sort())===JSON.stringify(keys.slice().sort());
const ordered=r=>r.slice().sort((a,b)=>Buffer.compare(Buffer.from(JSON.stringify(a)),Buffer.from(JSON.stringify(b))));
const rowsHash=r=>sha(JSON.stringify(ordered(r)));
const inventory=Object.freeze({tables:34,triggers:42,foreignKeyColumns:169,ledgerEntries:14,engines:'InnoDB',pins});
const baselinePins=['b67ab03511cd972ee07f7e891d35134e84c0e0ac00ff8f27614f5fcf479108c6','2b5d77e9120b23debd57f39439ceee3fafee7b46c1c5c26c22c1597aebddab2e','c2bcabc28b3c26827ea0e1f5e01b6e6c0ce0c7d9797f6c5ed9c4c60150b0b4c7','4bf0afc1e375720abaadf5b3bc282ed0b7d5c83cd56e58f37b3b557133f1c179','4c020458375497ba0808a65ac76baaa839c13697de054608f5c42556ad14919b','763ee4dd6b9461a799bffc1f314bc0ff69bc6dd84a52f9e96841342051f01019','8f4fd143f23761e62f381cfcb736efe9380159bb786be07f46e9cee3d28add6f','7ad741a87d29157ed1236aacd9daef1f855b5c38f2351bb5e5cf9e305502c672','b8d26a4f7f9ce93407d3a3a5c63415bf3ca32a1843275ef5a3b99ba8ff15285c'];
const ledger=Object.freeze([
 ...Array.from({length:9},(_,i)=>{const prefix=String(i+1).padStart(3,'0')+'_';const dir=path.resolve(__dirname,'../../database/mysql');const files=readdirSync(dir).filter(n=>n.startsWith(prefix)&&n.endsWith('.sql'));assert(files.length===1,'baseline migration ambiguity');assert(sha(readFileSync(path.join(dir,files[0])))===baselinePins[i],'baseline migration hash changed');return [files[0],baselinePins[i]];}),
 ...['010_content_persistence_candidate.sql','011_authorization_trust_candidate.sql','012_quota_v2_candidate.sql','013_publication_funding_jobs_candidate.sql','014_observation_scope_candidate.sql'].map((name,i)=>[name,pins[i]])
]);
function validate(bytes,{key,source,destination,referenceMetadataHash,independentTrustVerified=false,destinationEmpty=false}){
 assert(Buffer.isBuffer(key)&&key.length===32,'independent archive key');
 assert(schema(source)&&schema(destination)&&source!==destination,'distinct disposable schemas');
 assert(destinationEmpty===true,'destination not independently verified empty');
 assert(independentTrustVerified===true,'current independent trust and revocation not reconciled');
 assert(/^[a-f0-9]{64}$/.test(referenceMetadataHash||''),'reference metadata absent');
 assert(Buffer.isBuffer(bytes)&&bytes.length>0&&bytes.length<=32*1024*1024,'archive size');
 const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes),envelope=JSON.parse(text);
 assert(exact(envelope,['format','payload','digest','mac'])&&JSON.stringify(envelope)===text&&envelope.format===FORMAT,'canonical archive envelope');
 assert(typeof envelope.payload==='string'&&envelope.digest===sha(envelope.payload)&&/^[a-f0-9]{64}$/.test(envelope.mac),'archive digest');
 const mac=createHmac('sha256',key).update(FORMAT+'\n'+envelope.digest+'\n'+envelope.payload).digest();
 assert(timingSafeEqual(mac,Buffer.from(envelope.mac,'hex')),'archive authenticity');
 const doc=JSON.parse(envelope.payload);
 assert(exact(doc,['format','sourceSchema','metadataHash','inventory','tables','trustAnchorDigest'])&&JSON.stringify(doc)===envelope.payload&&doc.format===FORMAT&&doc.sourceSchema===source,'archive source');
 assert(doc.metadataHash===referenceMetadataHash&&JSON.stringify(doc.inventory)===JSON.stringify(inventory),'pinned metadata/inventory');
 assert(/^[a-f0-9]{64}$/.test(doc.trustAnchorDigest||''),'independent trust digest missing');
 assert(Array.isArray(doc.tables)&&doc.tables.length===tables.length,'table inventory');let total=0;
 for(let i=0;i<tables.length;i++){
  const t=doc.tables[i];assert(exact(t,['name','columns','rows','count','sha256'])&&t.name===tables[i]&&Array.isArray(t.columns)&&t.columns.length>0&&new Set(t.columns).size===t.columns.length&&t.columns.every(c=>/^[a-z][a-z0-9_]*$/.test(c)),'table/column inventory');
  assert(Array.isArray(t.rows)&&t.rows.length===t.count&&t.rows.length<=100000,'table row count');total+=t.count;assert(total<=100000,'aggregate row limit');
  assert(t.rows.every(r=>Array.isArray(r)&&r.length===t.columns.length&&r.every(v=>v===null||typeof v==='string')),'typed row');
  assert(JSON.stringify(t.rows)===JSON.stringify(ordered(t.rows))&&t.sha256===rowsHash(t.rows),'deterministic row hash');
 }
 const savedLedger=doc.tables.find(t=>t.name==='growth_schema_migrations');
 assert(savedLedger.columns.includes('migration_id')&&savedLedger.columns.includes('sha256')&&savedLedger.count===14,'ledger columns/count');
 const actual=savedLedger.rows.map(r=>[r[savedLedger.columns.indexOf('migration_id')],r[savedLedger.columns.indexOf('sha256')]]).sort((a,b)=>a[0].localeCompare(b[0]));
 assert(JSON.stringify(actual)===JSON.stringify(ledger.slice().sort((a,b)=>a[0].localeCompare(b[0]))),'pinned ledger hashes');
 // No SQL is interpreted. An actual restore must independently verify all columns, indexes,
 // foreign keys, CHECKs, triggers, ledger entries and trust roots, then refuse partial retry.
 return {reviewOnly:true,restoreExecutable:false,publicationAuthorized:false,tableCount:tables.length};
}
function sealFixture(doc,key){const payload=JSON.stringify(doc),digest=sha(payload);return Buffer.from(JSON.stringify({format:FORMAT,payload,digest,mac:createHmac('sha256',key).update(FORMAT+'\n'+digest+'\n'+payload).digest('hex')}));}
module.exports={FORMAT,tables,pins,ledger,inventory,rowsHash,validate,sealFixture};
