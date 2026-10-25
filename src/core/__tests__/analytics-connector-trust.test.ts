import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {assessMeasurement,measurementDigest,providerCapabilities,unavailableConnector,type MeasurementEnvelope,type ProviderIdentity} from '../analytics-connector-trust';
import type {AnalyticsObservation} from '../offline-analytics';
const identity:ProviderIdentity={kind:'ga4',providerId:'google',accountId:'acct',resourceId:'property',organizationId:'org',websiteId:'site',scopes:['analytics.readonly'],timezone:'UTC',attribution:'last-touch',currency:'USD'};
const observation:AnalyticsObservation={id:'550e8400-e29b-41d4-a716-446655440000',organizationId:'org',websiteId:'site',source:'ga4-report',sourceKind:'manual-import',observedAt:'2026-10-24T12:00:00Z',day:'2026-10-24',visitorDefinition:'sessions',attribution:'last-touch',currency:'USD',channel:'organic',landingPage:null,contentId:null,campaignId:null,visits:20,engagedVisits:null,conversions:null,searchImpressions:null,searchClicks:null,revenueMinor:null,spendMinor:null,costKind:null,revenueKind:null,settled:false};
const original={identity,observation,metric:'visits' as const,unit:'count' as const,periodFrom:'2026-10-24T00:00:00Z',periodThrough:'2026-10-24T23:59:59Z',collectedAt:'2026-10-25T01:00:00Z',provenance:{sourceRef:'batch1',issuerId:'issuer',keyRevision:2,signature:'synthetic',digest:'0'.repeat(64)}};
const envelope=():MeasurementEnvelope=>{const e=structuredClone(original);e.provenance.digest=measurementDigest(e);return e;};
const seen=new Set<string>();const replays={async consume(scope:string,key:string){const k=scope+key;if(seen.has(k))return false;seen.add(k);return true;}};
const authority={async verify(){return {valid:true,issuerCurrent:true,resourceAuthorized:true,revoked:false,independent:false};}};
const context=()=>({organizationId:'org',websiteId:'site',now:'2026-10-25T02:00:00Z',provider:identity,authority,replays,featureEnabled:true});
test('provider capabilities and disabled offline adapter cannot collect',async()=>{
 assert.equal(Object.keys(providerCapabilities).length,7);await assert.rejects(unavailableConnector(identity).collect(),/DISABLED/);
});
test('a provider report remains unverified without independent authority; synthetic remains synthetic',async()=>{
 assert.equal((await assessMeasurement(envelope(),{...context(),authority:null})).state,'provider-reported');
 const e=envelope();e.observation.sourceKind='synthetic-fixture';e.provenance.digest=measurementDigest(e);
 assert.equal((await assessMeasurement(e,context())).state,'synthetic');
});
test('signature, revocation, issuer revision, replay and independent verdict',async()=>{
 seen.clear();const e=envelope();assert.equal((await assessMeasurement(e,context())).state,'provider-authenticated');
 await assert.rejects(assessMeasurement(e,context()),/REPLAY/);
 await assert.rejects(assessMeasurement(envelope(),{...context(),authority:{async verify(){return {...await authority.verify(),revoked:true};}}}),/AUTHORITY_DENIED/);
 await assert.rejects(assessMeasurement(envelope(),{...context(),authority:{async verify(){return {...await authority.verify(),issuerCurrent:false};}}}),/AUTHORITY_DENIED/);
 await assert.rejects(assessMeasurement(envelope(),{...context(),replays:null}),/REPLAY_AUTHORITY_UNAVAILABLE/);
 seen.clear();assert.equal((await assessMeasurement(envelope(),{...context(),authority:{async verify(){return {...await authority.verify(),independent:true};}}})).state,'independently-verified');
});
test('scope, timestamp, digest, unit, feature and required scopes fail closed',async()=>{
 const e=envelope();await assert.rejects(assessMeasurement(e,{...context(),websiteId:'other'}),/SCOPE_DENIED/);
 await assert.rejects(assessMeasurement(e,{...context(),provider:{...identity,resourceId:'other'}}),/SCOPE_DENIED/);
 await assert.rejects(assessMeasurement(e,{...context(),provider:{...identity,scopes:['wrong']}}),/SCOPE_DENIED|SCOPE_MISSING/);
 await assert.rejects(assessMeasurement(e,{...context(),featureEnabled:false}),/FEATURE_DISABLED/);
 const forged=envelope();forged.observation.visits=999;await assert.rejects(assessMeasurement(forged,context()),/EVIDENCE_INVALID/);
 const stale=envelope();await assert.rejects(assessMeasurement(stale,{...context(),now:'2026-10-30T00:00:00Z'}),/EVIDENCE_INVALID/);
 const unit=envelope();unit.unit='minor-currency-unit';unit.provenance.digest=measurementDigest(unit);await assert.rejects(assessMeasurement(unit,context()),/EVIDENCE_INVALID/);
 const bad=envelope();bad.observation.websiteId='other';bad.provenance.digest=measurementDigest(bad);await assert.rejects(assessMeasurement(bad,context()),/SCOPE_DENIED/);
});
