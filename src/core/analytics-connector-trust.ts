import { createHash } from 'node:crypto';
import { z } from 'zod';
import { observationSchema, type AnalyticsObservation } from './offline-analytics';

export const providerKindSchema=z.enum(['ga4','search-console','youtube-analytics','website-analytics','advertising','affiliate','subscription']);
export type ProviderKind=z.infer<typeof providerKindSchema>;
export type TrustState='synthetic'|'manual'|'imported-unverified'|'provider-reported'|'provider-authenticated'|'independently-verified';
export type ProviderStatus='unknown'|'disconnected'|'unavailable'|'reported'|'authenticated'|'revoked';
import { providerCapabilities } from './analytics-provider-catalog';
export { providerCapabilities } from './analytics-provider-catalog';
const id=z.string().trim().min(1).max(128);
const instant=z.string().datetime({offset:true});
export const providerIdentitySchema=z.object({kind:providerKindSchema,providerId:id,accountId:id,resourceId:id,
  organizationId:id,websiteId:id,scopes:z.array(id).min(1).max(32),timezone:z.string().min(1).max(100),
  attribution:z.enum(['last-touch','first-touch','unattributed']),currency:z.string().regex(/^[A-Z]{3}$/).nullable()}).strict();
export type ProviderIdentity=z.infer<typeof providerIdentitySchema>;
export const measurementEnvelopeSchema=z.object({identity:providerIdentitySchema,observation:observationSchema,
  metric:z.enum(['visits','conversions','searchImpressions','searchClicks','revenueMinor','spendMinor']),
  unit:z.enum(['count','minor-currency-unit']),periodFrom:instant,periodThrough:instant,collectedAt:instant,
  provenance:z.object({sourceRef:id,issuerId:id.nullable(),keyRevision:z.number().int().positive().nullable(),
    signature:z.string().max(4096).nullable(),digest:z.string().regex(/^[a-f0-9]{64}$/)}).strict()}).strict();
export type MeasurementEnvelope=z.infer<typeof measurementEnvelopeSchema>;
export type AuthorityVerdict={valid:boolean;issuerCurrent:boolean;resourceAuthorized:boolean;revoked:boolean;independent:boolean};
/** Implementations must obtain current issuer, key, resource and revocation state from an independent authority. */
export interface MeasurementAuthority { verify(envelope:MeasurementEnvelope,canonicalBytes:string):Promise<AuthorityVerdict|null> }
export interface EvidenceReplayStore { consume(scope:string,evidenceKey:string):Promise<boolean> }
export interface AnalyticsConnector { readonly identity:ProviderIdentity; readonly status:ProviderStatus;
  collect():Promise<readonly MeasurementEnvelope[]> }
export const unavailableConnector=(identity:ProviderIdentity):AnalyticsConnector=>({identity,status:'unavailable',
  async collect(){throw Error('ANALYTICS_CONNECTOR_DISABLED');}});
const canonical=(e:MeasurementEnvelope)=>JSON.stringify({identity:e.identity,observation:e.observation,metric:e.metric,unit:e.unit,
  periodFrom:e.periodFrom,periodThrough:e.periodThrough,collectedAt:e.collectedAt,sourceRef:e.provenance.sourceRef,
  issuerId:e.provenance.issuerId,keyRevision:e.provenance.keyRevision});
export const measurementDigest=(e:MeasurementEnvelope)=>createHash('sha256').update(canonical(e)).digest('hex');
const metricKinds:Record<MeasurementEnvelope['metric'],MeasurementEnvelope['unit']>={visits:'count',conversions:'count',
  searchImpressions:'count',searchClicks:'count',revenueMinor:'minor-currency-unit',spendMinor:'minor-currency-unit'};
export async function assessMeasurement(raw:unknown,context:{organizationId:string;websiteId:string;now:string;
  provider:ProviderIdentity;authority:MeasurementAuthority|null;replays:EvidenceReplayStore|null;featureEnabled:boolean}):Promise<{
    state:TrustState;observation:AnalyticsObservation;reason:string}> {
  const e=measurementEnvelopeSchema.parse(raw),p=providerIdentitySchema.parse(context.provider),o=e.observation;
  if(!context.featureEnabled)throw Error('ANALYTICS_FEATURE_DISABLED');
  if(e.identity.organizationId!==context.organizationId||e.identity.websiteId!==context.websiteId||
    p.organizationId!==context.organizationId||p.websiteId!==context.websiteId||Object.keys(p).some(key=>JSON.stringify(e.identity[key as keyof ProviderIdentity])!==JSON.stringify(p[key as keyof ProviderIdentity]))||
    o.organizationId!==context.organizationId||o.websiteId!==context.websiteId)throw Error('ANALYTICS_PROVIDER_SCOPE_DENIED');
  if(!providerCapabilities[p.kind].every(scope=>p.scopes.includes(scope)))throw Error('ANALYTICS_PROVIDER_SCOPE_MISSING');
  const now=Date.parse(context.now),from=Date.parse(e.periodFrom),through=Date.parse(e.periodThrough),collected=Date.parse(e.collectedAt);
  if(!Number.isFinite(now)||from>through||through>collected||collected>now||now-collected>86400000||
    e.unit!==metricKinds[e.metric]||o[e.metric]===null||
    (e.unit==='minor-currency-unit'&&(!o.currency||o.currency!==p.currency))||o.attribution!==p.attribution||
    o.day<e.periodFrom.slice(0,10)||o.day>e.periodThrough.slice(0,10)||
    Date.parse(o.observedAt)<from||Date.parse(o.observedAt)>through||
    e.provenance.digest!==measurementDigest(e))throw Error('ANALYTICS_EVIDENCE_INVALID');
  // A provider response is only a report. It cannot promote legacy offline observations or authorize persistence.
  if(o.sourceKind==='synthetic-fixture')return {state:'synthetic',observation:o,reason:'Synthetic fixture; no provider authority'};
  if(!e.provenance.signature||!e.provenance.issuerId||!e.provenance.keyRevision||!context.authority)
    return {state:'provider-reported',observation:o,reason:'Independent signature and revocation authority unavailable'};
  const verdict=await context.authority.verify(e,canonical(e));
  if(!verdict||!verdict.valid||!verdict.issuerCurrent||!verdict.resourceAuthorized||verdict.revoked)
    throw Error('ANALYTICS_EVIDENCE_AUTHORITY_DENIED');
  if(!context.replays)throw Error('ANALYTICS_REPLAY_AUTHORITY_UNAVAILABLE');
  const key=[p.providerId,p.accountId,p.resourceId,e.provenance.issuerId,e.provenance.keyRevision,e.provenance.sourceRef,e.provenance.digest].join(':');
  if(!await context.replays.consume(context.organizationId+':'+context.websiteId,key))throw Error('ANALYTICS_EVIDENCE_REPLAY');
  return {state:verdict.independent?'independently-verified':'provider-authenticated',observation:o,
    reason:verdict.independent?'Independent resource and issuer evidence checked':'Provider identity authenticated; independent verification unavailable'};
}
