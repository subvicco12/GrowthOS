'use strict';
// Review-only data archive. Deliberately exports no restore/database executor.
const crypto=require('node:crypto');const {TextDecoder}=require('node:util');
const {contract,sha,assert}=require('./unified-schema-review-v2.cjs');
const FORMAT='growthos-unified-recovery-v2-review',MAX_BYTES=32*1024*1024,MAX_ROWS=100000;
const canonical=JSON.stringify, same=(a,b)=>canonical(a)===canonical(b);
const exact=(x,keys)=>x&&typeof x==='object'&&!Array.isArray(x)&&same(Object.keys(x).sort(),keys.slice().sort());
const safeSchema=s=>typeof s==='string'&&/^growthos_test_[a-z0-9_]{1,48}$/.test(s);
const ordered=rows=>rows.slice().sort((a,b)=>Buffer.compare(Buffer.from(canonical(a)),Buffer.from(canonical(b))));
function rowHash(rows){return sha(canonical(ordered(rows)));}
function keyCheck(key){assert(Buffer.isBuffer(key)&&key.length===32,'independent 256-bit archive key');}
function sealReviewFixture(document,key){keyCheck(key);const payload=canonical(document);const digest=sha(payload);return Buffer.from(canonical({format:FORMAT,payload,sha256:digest,signature:crypto.createHmac('sha256',key).update(FORMAT+'\n'+digest+'\n'+payload).digest('hex')}));}
function validate(bytes,{key,source,destination,referenceMetadataHash}){
 keyCheck(key);assert(safeSchema(source)&&safeSchema(destination)&&source!==destination,'independent disposable identities');assert(Buffer.isBuffer(bytes)&&bytes.length>0&&bytes.length<=MAX_BYTES,'archive size');
 let text;try{text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{throw Error('REFUSED: malformed UTF-8');}
 const envelope=JSON.parse(text);assert(exact(envelope,['format','payload','sha256','signature'])&&canonical(envelope)===text&&envelope.format===FORMAT&&typeof envelope.payload==='string','canonical envelope');
 const digest=sha(envelope.payload);assert(envelope.sha256===digest&&typeof envelope.signature==='string'&&/^[a-f0-9]{64}$/.test(envelope.signature),'archive digest');
 const signature=crypto.createHmac('sha256',key).update(FORMAT+'\n'+digest+'\n'+envelope.payload).digest();assert(crypto.timingSafeEqual(signature,Buffer.from(envelope.signature,'hex')),'archive signature');
 const d=JSON.parse(envelope.payload),m=contract();assert(exact(d,['format','sourceSchema','contractHash','metadataHash','tables','trustCheckpoints'])&&canonical(d)===envelope.payload&&d.format===FORMAT&&d.sourceSchema===source&&d.contractHash===m.contractHash,'schema contract');
 assert(typeof referenceMetadataHash==='string'&&/^[a-f0-9]{64}$/.test(referenceMetadataHash)&&d.metadataHash===referenceMetadataHash,'independent reference metadata required');
 assert(Array.isArray(d.tables)&&d.tables.length===m.tables.length&&Array.isArray(d.trustCheckpoints),'inventory');let count=0;const byName=new Map();
 for(let i=0;i<m.tables.length;i++){const expected=m.tables[i],t=d.tables[i];assert(exact(t,['name','columns','rows','count','sha256'])&&t.name===expected.name&&same(t.columns,expected.columns.map(c=>c.name))&&Array.isArray(t.rows)&&t.rows.length<=MAX_ROWS&&t.count===t.rows.length,'table contract');
 for(const row of t.rows)assert(Array.isArray(row)&&row.length===t.columns.length&&row.every(v=>v===null||typeof v==='string'),'typed cells only');
 assert(same(t.rows,ordered(t.rows))&&t.sha256===rowHash(t.rows),'row order/count/hash');count+=t.count;assert(count<=MAX_ROWS,'aggregate row cap');byName.set(t.name,t);}
 const objects=name=>{const t=byName.get(name);return t.rows.map(row=>Object.fromEntries(t.columns.map((c,i)=>[c,row[i]])));};
 for(const t of m.tables){const saved=byName.get(t.name);for(const index of t.indexes.filter(i=>i.unique)){const seen=new Set();for(const row of saved.rows){const tuple=index.columns.map(c=>row[saved.columns.indexOf(c)]);if(tuple.some(x=>x===null))continue;const k=canonical(tuple);assert(!seen.has(k),'duplicate unique key');seen.add(k);}}
 for(const fk of t.foreignKeys){const parent=byName.get(fk.parent),keys=new Set(parent.rows.map(row=>canonical(fk.parentColumns.map(c=>row[parent.columns.indexOf(c)]))));for(const row of saved.rows){const tuple=fk.columns.map(c=>row[saved.columns.indexOf(c)]);if(tuple.some(x=>x===null))continue;assert(keys.has(canonical(tuple)),'foreign-key scope');}}}
 const ledger=objects('growth_schema_migrations').map(r=>[r.migration_id,r.sha256]).sort((a,b)=>a[0].localeCompare(b[0]));assert(same(ledger,m.ledger),'twelve pinned migration hashes');
 const mirrors=[['growth_content_records','record_json',{organizationId:'organization_id',websiteId:'website_id',id:'id',version:'version',stage:'stage'}],['growth_content_events','record_json',{organizationId:'organization_id',websiteId:'website_id',id:'content_id',version:'version'}],['growth_content_authorizations','authorization_json',{organizationId:'organization_id',websiteId:'website_id',id:'id',contentId:'content_id',contentVersion:'content_version',channel:'channel',approvalDecisionId:'approval_event_id',reservationId:'reservation_id',destinationId:'destination_id',approverId:'approver_id'}],['growth_quota_reservations_v2','reservation_json',{organizationId:'organization_id',websiteId:'website_id',id:'id'}]];
 for(const [table,col,fields]of mirrors)for(const row of objects(table)){const json=JSON.parse(row[col]);for(const [field,scalar]of Object.entries(fields))assert(json[field]!==undefined&&String(json[field])===row[scalar],'JSON scope/version mirror');}
 validateEvidenceScopes(objects);
 // SQL strings are never interpreted. Exact fields prohibit executable SQL, DDL or client directives.
 return {document:d,reviewOnly:true,restoreExecutable:false,trustReconciliationRequired:true};
}
function validateEvidenceScopes(objects){
 const fields={organizationId:'organization_id',websiteId:'website_id',issuer:'issuer',keyId:'key_id',eventId:'event_id',channel:'channel',destinationId:'destination_id'};
 const histories=objects('growth_connector_evidence_history');
 for(const row of histories){const p=JSON.parse(row.probe_json),e=p.attestation?.evidence;assert(e&&Object.entries(fields).every(([j,c])=>typeof e[j]==='string'&&e[j]===row[c]),'probe JSON scope');assert(Number.isSafeInteger(p.sequence)&&String(p.sequence)===row.sequence&&p.previousHash===row.previous_hash,'probe sequence chain mirror');}
 for(const row of objects('growth_connector_attestations')){const signed=JSON.parse(row.signed_json);assert(signed.evidence&&Object.entries(fields).every(([j,c])=>signed.evidence[j]===row[c]),'attestation JSON scope');const h=histories.find(h=>h.issuer===row.issuer&&h.key_id===row.key_id&&h.event_id===row.event_id);assert(h&&h.sequence===row.sequence&&h.payload_hash===row.payload_hash&&same(JSON.parse(h.probe_json).attestation,signed),'current/history binding');}
 const authorizations=objects('growth_content_authorizations');
 for(const row of objects('growth_publication_authorization_events')){const auth=authorizations.find(a=>a.organization_id===row.organization_id&&a.website_id===row.website_id&&a.id===row.authorization_id);assert(auth&&same(JSON.parse(auth.authorization_json),JSON.parse(row.authorization_json)),'authorization audit snapshot');}
 for(const row of objects('growth_publication_authorization_uses')){const auth=authorizations.find(a=>a.organization_id===row.organization_id&&a.website_id===row.website_id&&a.id===row.authorization_id);assert(auth&&auth.consumed_at!==null&&auth.revoked_at===null&&['content_id','content_version','destination_id','claim_hash'].every(c=>auth[c]===row[c])&&auth.approval_event_id===row.approval_decision_id,'authorization use binding');}
 for(const row of objects('growth_publication_observations')){const o=JSON.parse(row.observation_json).observation;assert(o&&Object.entries({organizationId:'organization_id',websiteId:'website_id',contentId:'content_id',channel:'channel',issuer:'issuer',eventId:'event_id'}).every(([j,c])=>o[j]===row[c]),'provider observation scope');}
 // Registry signatures, chain completeness, settlement balances and anchor liveness are separate mandatory gates.
}
function reconcileTrust(saved,independent){
 assert(Array.isArray(saved)&&Array.isArray(independent),'trust snapshots');const seen=new Set();
 for(const s of saved){assert(exact(s,['issuer','keyId','generation','sequence','hash','revoked','pending'])&&typeof s.issuer==='string'&&typeof s.keyId==='string'&&Number.isSafeInteger(s.generation)&&s.generation>=0&&Number.isSafeInteger(s.sequence)&&s.sequence>=0&&(s.hash===null||/^[a-f0-9]{64}$/.test(s.hash))&&typeof s.revoked==='boolean'&&typeof s.pending==='boolean','checkpoint shape');const k=canonical([s.issuer,s.keyId]);assert(!seen.has(k),'duplicate checkpoint');seen.add(k);const matches=independent.filter(i=>i.issuer===s.issuer&&i.keyId===s.keyId);assert(matches.length===1,'independent checkpoint absent/duplicate');const current=matches[0];assert(same(s,current)&&!current.pending&&!current.revoked,'trust rollback/revocation/pending: HOLD');}
 assert(independent.length===saved.length,'unreconciled independent trust');return {status:'SNAPSHOTS_MATCH_ONLY',publicationAuthorized:false,requiresLiveIndependentLease:true};
}
module.exports={FORMAT,MAX_BYTES,rowHash,ordered,sealReviewFixture,validate,validateEvidenceScopes,reconcileTrust};
