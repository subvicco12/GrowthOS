import {createHash,verify,createPublicKey} from 'node:crypto';
import {z} from 'zod';
import {validateProviderRevenue,type ProviderRevenueEvent} from './local-provider-revenue';
const key=z.string().min(1).max(160).regex(/^[A-Za-z0-9:_./-]+$/);
const envelope=z.object({version:z.literal(1),event:z.unknown(),issuerId:key,keyRevision:z.number().int().positive(),
 issuedAt:z.string().datetime({offset:true}),expiresAt:z.string().datetime({offset:true}),signature:z.string().min(1).max(1024).regex(/^[A-Za-z0-9+/]+={0,2}$/)}).strict();
export type ProviderSignedEnvelope=z.infer<typeof envelope>;
export type TrustKey={issuerId:string;keyRevision:number;category:string;providerId:string;accountId:string;resourceId:string;
 organizationId:string;websiteId:string;publicKeyPem:string;revoked:boolean;notBefore:string;notAfter:string};
export interface SyntheticTrustRegistry {readonly kind:'synthetic';lookup(issuerId:string):Promise<TrustKey|null>}
export interface SyntheticReplayStore {readonly kind:'synthetic';consume(scope:string,key:string):Promise<boolean>}
export const canonicalProviderBytes=(e:ProviderRevenueEvent,issuerId:string,keyRevision:number,issuedAt:string,expiresAt:string)=>
 JSON.stringify([1,e.id,e.organizationId,e.websiteId,e.category,e.providerId,e.accountId,e.resourceId,e.sourceRecordId,e.sourceEventId,
  e.importBatchId,e.periodFrom,e.periodThrough,e.occurredAt,e.currency,e.amountMinor,e.basis,e.state,e.settlementReference,
  e.relatedEventId,e.provenance,e.verification,e.authority,issuerId,keyRevision,issuedAt,expiresAt]);
/** Test-only signature verification. Production issuer, custody, fencing and replay authorities are deliberately absent. */
export async function assessSyntheticProviderSignature(raw:unknown,context:{organizationId:string;websiteId:string;now:string;
 featureEnabled:boolean;membershipCurrent:boolean;registry:SyntheticTrustRegistry|null;replays:SyntheticReplayStore|null}){
 if(!context.featureEnabled||!context.membershipCurrent)throw Error('PROVIDER_AUTHORIZATION_DENIED');
 const p=envelope.parse(raw),b=validateProviderRevenue({format:'growthos-provider-revenue-preview',version:1,organizationId:context.organizationId,
  websiteId:context.websiteId,events:[p.event],authority:'none'},context,context.now),e=b.events[0];
 if(!context.registry||context.registry.kind!=='synthetic'||!context.replays||context.replays.kind!=='synthetic')throw Error('PROVIDER_INDEPENDENT_AUTHORITY_UNAVAILABLE');
 const now=Date.parse(context.now),issued=Date.parse(p.issuedAt),expiry=Date.parse(p.expiresAt);
 if(!Number.isFinite(now)||issued>now||expiry<now||expiry<=issued||expiry-issued>86_400_000)throw Error('PROVIDER_SIGNATURE_TIME_DENIED');
 const trust=await context.registry.lookup(p.issuerId);
 if(!trust||trust.revoked||trust.issuerId!==p.issuerId||trust.keyRevision!==p.keyRevision||
  trust.organizationId!==e.organizationId||trust.websiteId!==e.websiteId||trust.category!==e.category||
  trust.providerId!==e.providerId||trust.accountId!==e.accountId||trust.resourceId!==e.resourceId||
  !Number.isFinite(Date.parse(trust.notBefore))||!Number.isFinite(Date.parse(trust.notAfter))||
  issued<Date.parse(trust.notBefore)||expiry>Date.parse(trust.notAfter))throw Error('PROVIDER_TRUST_DENIED');
 const decoded=Buffer.from(p.signature,'base64');if(decoded.toString('base64')!==p.signature)throw Error('PROVIDER_SIGNATURE_FORMAT_DENIED');
 let valid=false;try{const publicKey=createPublicKey(trust.publicKeyPem);if(publicKey.asymmetricKeyType!=='ed25519')throw Error('PROVIDER_KEY_ALGORITHM_DENIED');
  valid=verify(null,Buffer.from(canonicalProviderBytes(e,p.issuerId,p.keyRevision,p.issuedAt,p.expiresAt)),publicKey,decoded);
 }catch{throw Error('PROVIDER_SIGNATURE_DENIED');}
 if(!valid)throw Error('PROVIDER_SIGNATURE_DENIED');
 const digest=createHash('sha256').update(canonicalProviderBytes(e,p.issuerId,p.keyRevision,p.issuedAt,p.expiresAt)).digest('hex');
 if(!await context.replays.consume(`${e.organizationId}:${e.websiteId}:${e.providerId}:${e.accountId}:${e.resourceId}`,e.sourceEventId))throw Error('PROVIDER_SIGNATURE_REPLAY');
 return {state:'synthetic-signature-valid' as const,certified:false,settlementVerified:false,eventId:e.id,canonicalDigest:digest,
  reason:'Synthetic key and replay store; no independent provider or payout authority'};
}
