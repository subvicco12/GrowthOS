import {test} from 'node:test';import assert from 'node:assert/strict';
import {generateKeyPairSync,sign} from 'node:crypto';
import {appendProviderRevenue,emptyProviderRevenue,type ProviderRevenueEvent} from '../local-provider-revenue';
import {providerIdentityReadiness,portfolioProviderReadiness} from '../provider-trust-readiness';
import {assessSyntheticProviderSignature,canonicalProviderBytes,type TrustKey,type SyntheticReplayStore} from '../provider-signature-offline';
const scope={organizationId:'org_1',websiteId:'site_1'},now='2026-10-26T12:00:00.000Z';
const event=():ProviderRevenueEvent=>({id:'evt-1',...scope,category:'paddle',providerId:'paddle-synthetic',accountId:'acct-1',resourceId:'resource-1',
 sourceRecordId:'tx-1',sourceEventId:'delivery-1',importBatchId:'batch-1',periodFrom:'2026-10-01',periodThrough:'2026-10-26',
 occurredAt:'2026-10-10T10:00:00.000Z',currency:'USD',amountMinor:1000,basis:'gross',state:'completed',settlementReference:null,
 relatedEventId:null,provenance:'synthetic',verification:'unverified',authority:'none'});
const signed=()=>{const {publicKey,privateKey}=generateKeyPairSync('ed25519'),e=event(),issuedAt='2026-10-26T11:00:00.000Z',expiresAt='2026-10-26T13:00:00.000Z';
 const signature=sign(null,Buffer.from(canonicalProviderBytes(e,'issuer-1',2,issuedAt,expiresAt)),privateKey).toString('base64');
 const trust:TrustKey={issuerId:'issuer-1',keyRevision:2,category:'paddle',providerId:e.providerId,accountId:e.accountId,resourceId:e.resourceId,...scope,
  publicKeyPem:publicKey.export({type:'spki',format:'pem'}).toString(),revoked:false,notBefore:'2026-10-01T00:00:00.000Z',notAfter:'2026-11-01T00:00:00.000Z'};
 return {envelope:{version:1,event:e,issuerId:'issuer-1',keyRevision:2,issuedAt,expiresAt,signature},trust};};
const harness=()=>{const s=signed(),used=new Set<string>();const replays:SyntheticReplayStore={kind:'synthetic',async consume(scope,key){const id=scope+':'+key;if(used.has(id))return false;used.add(id);return true;}};
 return {...s,used,context:{...scope,now,featureEnabled:true,membershipCurrent:true,registry:{kind:'synthetic' as const,async lookup(){return s.trust;}},replays}};};
test('identity readiness stays a claim even with provider names, transaction IDs and local payouts',()=>{
 const b=appendProviderRevenue(emptyProviderRevenue(scope),event(),scope,now),r=providerIdentityReadiness(b,scope,now);
 assert.equal(r.identities[0].identityState,'claimed-unverified');assert.equal(r.identities[0].signatureState,'unavailable');
 assert.equal(r.identities[0].settlementState,'unavailable');assert.equal(r.verifiedRevenue,'Unavailable');
 assert.ok(r.identities[0].requirements.includes('Current webhook signing key and revocation'));
 assert.equal(portfolioProviderReadiness([b],scope.organizationId,['site_1','site_2'],now)[1].identityClaims,0);
 assert.throws(()=>portfolioProviderReadiness([b],'org_2',['site_1'],now));
});
test('synthetic Ed25519 verifies exact event bytes but confers no provider or settlement authority',async()=>{
 const h=harness(),result=await assessSyntheticProviderSignature(h.envelope,h.context);
 assert.equal(result.state,'synthetic-signature-valid');assert.equal(result.certified,false);assert.equal(result.settlementVerified,false);
 assert.match(result.canonicalDigest,/^[a-f0-9]{64}$/);
 await assert.rejects(assessSyntheticProviderSignature(h.envelope,h.context),/REPLAY/);
});
test('tampering, wrong key revision, revoked issuer and wrong account refuse',async()=>{
 for(const mutate of [
  (h:ReturnType<typeof harness>)=>({...h.envelope,event:{...h.envelope.event,amountMinor:2000}}),
  (h:ReturnType<typeof harness>)=>({...h.envelope,event:{...h.envelope.event,websiteId:'site_2'}}),
  (h:ReturnType<typeof harness>)=>({...h.envelope,keyRevision:1}),
  (h:ReturnType<typeof harness>)=>({...h.envelope,signature:'AAAA'}),
 ]){const h=harness();await assert.rejects(assessSyntheticProviderSignature(mutate(h),h.context));}
 const revoked=harness();revoked.trust.revoked=true;await assert.rejects(assessSyntheticProviderSignature(revoked.envelope,revoked.context),/TRUST_DENIED/);
 const wrong=harness();wrong.trust.accountId='foreign';await assert.rejects(assessSyntheticProviderSignature(wrong.envelope,wrong.context),/TRUST_DENIED/);
});
test('expired signatures, stale issuer keys, missing authority and disabled policy fail closed',async()=>{
 const h=harness();await assert.rejects(assessSyntheticProviderSignature(h.envelope,{...h.context,now:'2026-10-27T00:00:00.000Z'}),/TIME_DENIED/);
 h.trust.keyRevision=3;await assert.rejects(assessSyntheticProviderSignature(h.envelope,h.context),/TRUST_DENIED/);
 const x=harness();await assert.rejects(assessSyntheticProviderSignature(x.envelope,{...x.context,registry:null}),/AUTHORITY_UNAVAILABLE/);
 await assert.rejects(assessSyntheticProviderSignature(x.envelope,{...x.context,replays:null}),/AUTHORITY_UNAVAILABLE/);
 await assert.rejects(assessSyntheticProviderSignature(x.envelope,{...x.context,membershipCurrent:false}),/AUTHORIZATION_DENIED/);
 await assert.rejects(assessSyntheticProviderSignature(x.envelope,{...x.context,featureEnabled:false}),/AUTHORIZATION_DENIED/);
 const malformed=harness();malformed.trust.notAfter='not-a-date';await assert.rejects(assessSyntheticProviderSignature(malformed.envelope,malformed.context),/TRUST_DENIED/);
});
