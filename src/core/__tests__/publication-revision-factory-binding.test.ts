import test from 'node:test';
import assert from 'node:assert/strict';
import type {PoolConnection} from 'mysql2/promise';
import {bindFactoryPublicationRevision} from '../../server/publication-revision-factory-binding';
import type {FactoryDurableAuthorities} from '../../server/mysql-content-factory-store';
import type {PublicationRevisionAuthorities} from '../../server/mysql-publication-revision-invalidator';

const scope={organizationId:'org1',websiteId:'site1',contentId:'content1'};
const at='2026-10-21T01:00:00.000Z';
function setup(){
 const seen:string[]=[];let releaseAllowed=true;
 const connection={execute:async(sql:string,args:unknown[])=>{seen.push(sql);
  if(sql.startsWith('SELECT'))assert.deepEqual(args.slice(0,3),['org1','site1','content1']);
  if(sql.startsWith('UPDATE')||sql.startsWith('INSERT'))return [{affectedRows:1},[]];
  if(sql.includes('growth_publication_claims')||sql.includes('growth_publication_funding_bindings')||sql.includes('growth_publication_jobs')||sql.includes('growth_content_authorizations'))return [[],[]];
  if(sql.includes('growth_quota_reservations_v2'))return [[{id:'fund1',version:0,state:'reserved',charged_units:0,charged_minor:0,started_at:null}],[]];
  throw Error('UNEXPECTED_SQL');}} as unknown as PoolConnection;
 const factory:FactoryDurableAuthorities={policy:async()=>({revision:'p1',enabled:true,regulated:false,requiredDisclosures:[]}),evidence:async()=>{},currentApprover:async()=>{},invalidate:async()=>{throw Error('UNSAFE_FALLBACK');}};
 const revision:PublicationRevisionAuthorities={capability:'publication-revision-authorities-v1',currentActor:async c=>{assert.equal(c,connection);return 'owner1';},verifyRelease:async(c,s)=>{assert.equal(c,connection);assert.deepEqual(s,scope);if(!releaseAllowed)throw Error('RELEASE_REVOKED');return {authorizationRevision:'a1',policyRevision:'p1',expiresAt:'2026-10-21T01:01:00.000Z'};}};
 return {factory,revision,connection,seen,revoke:()=>{releaseAllowed=false;}};
}
test('factory revision binding uses the supplied locked connection and refuses missing authority',async()=>{
 const f=setup();const bound=bindFactoryPublicationRevision(f.factory,f.revision);
 await bound.invalidate(f.connection,scope,5,'revision1',at);
 assert.ok(f.seen.some(s=>s.includes('growth_quota_events_v2')));
 assert.ok(f.seen.every(s=>!s.includes('START TRANSACTION')&&!s.includes('COMMIT')));
 assert.throws(()=>bindFactoryPublicationRevision(f.factory,{} as PublicationRevisionAuthorities),/FACTORY_REVISION_AUTHORITIES_REQUIRED/);
});
test('revoked release refuses before funding update; caller must roll back',async()=>{
 const f=setup();f.revoke();const bound=bindFactoryPublicationRevision(f.factory,f.revision);
 await assert.rejects(()=>bound.invalidate(f.connection,scope,5,'revision1',at),/RELEASE_REVOKED/);
 assert.ok(!f.seen.some(s=>s.startsWith('UPDATE')));
});
