import {z} from 'zod';
import {validateRevenueHandoff} from './local-revenue-workspace';
/** FNV-1a is a local duplicate aid, never an authenticity signature. */
const localFingerprint=(value:string)=>{let h=0xcbf29ce484222325n;for(const byte of new TextEncoder().encode(value))h=(h^BigInt(byte))*0x100000001b3n&0xffffffffffffffffn;
 return h.toString(16).padStart(16,'0');};
const ident=z.string().min(1).max(120).regex(/^[A-Za-z0-9:_-]+$/);
const token=z.string().min(1).max(160).regex(/^[A-Za-z0-9:_./-]+$/);
const instant=z.string().datetime({offset:true});
const day=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v=>Number.isFinite(Date.parse(v+'T00:00:00Z'))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v);
const scales={USD:2,EUR:2,GBP:2,INR:2,CAD:2,AUD:2,CHF:2,AED:2,JPY:0,KRW:0,CLP:0,KWD:3,BHD:3,OMR:3,TND:3} as const;
const currency=z.enum(Object.keys(scales) as [keyof typeof scales,...(keyof typeof scales)[]]);
export function minorFromDecimal(raw:string,code:keyof typeof scales){const scale=scales[currency.parse(code)];
 if(!/^\d+(?:\.\d+)?$/.test(raw))throw Error('PROVIDER_AMOUNT_FORMAT_DENIED');
 const [whole,fraction='']=raw.split('.');if(fraction.length>scale)throw Error('PROVIDER_CURRENCY_PRECISION_DENIED');
 const n=BigInt(whole)*10n**BigInt(scale)+BigInt((fraction||'').padEnd(scale,'0')||'0');
 if(n>BigInt(Number.MAX_SAFE_INTEGER))throw Error('PROVIDER_AMOUNT_OVERFLOW');return Number(n);
}
const payment=z.enum(['initiated','pending','authorized','captured','completed','partially-refunded','refunded','disputed','reversed','settled','failed','cancelled']);
const affiliate=z.enum(['pending','approved','rejected','reversed','paid']);
const advertising=z.enum(['estimated','finalized','payment-issued','payment-received']);
const commerce=z.enum(['pending','paid','partially-refunded','refunded','cancelled']);
const kinds=z.enum(['paddle','stripe','payment-other','adsense','advertising-other','affiliate','woocommerce','commerce-other','lead-generation','digital-product','service-payment','manual']);
export type ProviderCategory=z.infer<typeof kinds>;
const states={paddle:payment,stripe:payment,'payment-other':payment,adsense:advertising,'advertising-other':advertising,
 affiliate,woocommerce:commerce,'commerce-other':commerce,'lead-generation':payment,'digital-product':payment,'service-payment':payment,manual:payment};
const event=z.object({id:ident,organizationId:ident,websiteId:ident,category:kinds,providerId:token,accountId:token,resourceId:token,
 sourceRecordId:token,sourceEventId:token,importBatchId:token,periodFrom:day,periodThrough:day,occurredAt:instant,
 currency,amountMinor:z.number().int().safe().nonnegative(),basis:z.enum(['status','gross','refund','fee','payout','estimate']),
 state:z.string().min(1).max(30),settlementReference:token.nullable(),relatedEventId:ident.nullable(),
 provenance:z.enum(['manual-unverified','imported-unverified','synthetic','provider-shaped-offline']),
 verification:z.literal('unverified'),authority:z.literal('none')}).strict();
const bundle=z.object({format:z.literal('growthos-provider-revenue-preview'),version:z.literal(1),organizationId:ident,websiteId:ident,
 events:z.array(event).max(150),authority:z.literal('none')}).strict();
export type ProviderRevenueEvent=z.infer<typeof event>;export type ProviderRevenueBundle=z.infer<typeof bundle>;
export const emptyProviderRevenue=(scope:{organizationId:string;websiteId:string}):ProviderRevenueBundle=>({format:'growthos-provider-revenue-preview',version:1,...scope,events:[],authority:'none'});
const transitions:Record<ProviderCategory,Record<string,string[]>>={
 paddle:{initiated:['pending','authorized','failed','cancelled'],pending:['authorized','captured','completed','failed','cancelled'],authorized:['captured','completed','failed','cancelled'],captured:['completed','settled','partially-refunded','refunded','disputed'],completed:['settled','partially-refunded','refunded','disputed'],settled:['partially-refunded','refunded','disputed'],disputed:['reversed','settled'], 'partially-refunded':['refunded','disputed','settled']},
 stripe:{},'payment-other':{},'lead-generation':{},'digital-product':{},'service-payment':{},manual:{},
 adsense:{estimated:['finalized'],finalized:['payment-issued'], 'payment-issued':['payment-received']},'advertising-other':{},
 affiliate:{pending:['approved','rejected','reversed'],approved:['paid','reversed']},
 woocommerce:{pending:['paid','cancelled'],paid:['partially-refunded','refunded'], 'partially-refunded':['refunded']},'commerce-other':{}};
for(const k of ['stripe','payment-other','lead-generation','digital-product','service-payment','manual'] as const)transitions[k]=transitions.paddle;
transitions['advertising-other']=transitions.adsense;transitions['commerce-other']=transitions.woocommerce;
const family=(k:ProviderCategory)=>['paddle','stripe','payment-other','lead-generation','digital-product','service-payment','manual'].includes(k)?'payment':
 ['adsense','advertising-other'].includes(k)?'advertising':k==='affiliate'?'affiliate':'commerce';
const recordKey=(e:ProviderRevenueEvent)=>JSON.stringify([e.category,e.providerId,e.accountId,e.resourceId,e.sourceRecordId]);
const deliveryKey=(e:ProviderRevenueEvent)=>JSON.stringify([e.category,e.providerId,e.accountId,e.resourceId,e.sourceEventId]);
export const providerFingerprint=(e:ProviderRevenueEvent)=>localFingerprint(JSON.stringify([e.organizationId,e.websiteId,deliveryKey(e),e.currency,e.amountMinor,e.basis,e.state,e.occurredAt]));
export function validateProviderRevenue(raw:unknown,scope:{organizationId:string;websiteId:string},now:string):ProviderRevenueBundle{
 const parsed=bundle.parse(raw),time=Date.parse(now);if(!Number.isFinite(time))throw Error('PROVIDER_TIME_DENIED');
 if(parsed.organizationId!==scope.organizationId||parsed.websiteId!==scope.websiteId)throw Error('PROVIDER_SCOPE_DENIED');
 const ids=new Set<string>(),deliveries=new Set<string>(),groups=new Map<string,ProviderRevenueEvent[]>();
 for(const e of parsed.events){if(e.organizationId!==scope.organizationId||e.websiteId!==scope.websiteId)throw Error('PROVIDER_SCOPE_DENIED');
  if(!states[e.category].safeParse(e.state).success)throw Error('PROVIDER_LIFECYCLE_DENIED');
  const timestamp=Date.parse(e.occurredAt);if(e.periodFrom>e.periodThrough||timestamp>time||e.occurredAt.slice(0,10)<e.periodFrom||e.occurredAt.slice(0,10)>e.periodThrough)
   throw Error('PROVIDER_PERIOD_DENIED');
  const group=family(e.category);
  if(e.basis==='status'&&e.amountMinor!==0||
    group==='advertising'&&({'estimated':'estimate','finalized':'gross','payment-issued':'payout','payment-received':'payout'} as Record<string,string>)[e.state]!==e.basis||
    group==='affiliate'&&({'pending':'status','approved':'gross','rejected':'status','reversed':'status','paid':'payout'} as Record<string,string>)[e.state]!==e.basis||
    group==='commerce'&&({'pending':'status','paid':'gross','partially-refunded':'refund','refunded':'refund','cancelled':'status'} as Record<string,string>)[e.state]!==e.basis||
    group==='payment'&&(['initiated','pending','authorized','failed','cancelled','disputed'].includes(e.state)&&e.basis!=='status'||
      ['captured','completed'].includes(e.state)&&!['gross','fee'].includes(e.basis)||
      ['partially-refunded','refunded','reversed'].includes(e.state)&&e.basis!=='refund'||
      e.state==='settled'&&!['payout','fee'].includes(e.basis)))throw Error('PROVIDER_BASIS_DENIED');
  if(e.basis==='refund'&&!['partially-refunded','refunded','reversed'].includes(e.state)||
   e.basis==='fee'&&!['completed','settled','paid','payment-issued','payment-received'].includes(e.state)||
   e.basis==='payout'&&!['settled','paid','payment-issued','payment-received'].includes(e.state)||
   e.basis==='gross'&&['partially-refunded','refunded','reversed','rejected','failed','cancelled'].includes(e.state))throw Error('PROVIDER_BASIS_DENIED');
  if((e.basis==='refund'||e.basis==='fee')&&!e.relatedEventId)throw Error('PROVIDER_RELATED_EVENT_REQUIRED');
  if(e.settlementReference&&e.basis==='estimate')throw Error('PROVIDER_SETTLEMENT_DENIED');
  if(ids.has(e.id)||deliveries.has(deliveryKey(e)))throw Error('PROVIDER_DUPLICATE_DELIVERY');ids.add(e.id);deliveries.add(deliveryKey(e));
  const key=recordKey(e);groups.set(key,[...(groups.get(key)??[]),e]);
 }
 for(const events of groups.values()){
  const sorted=[...events].sort((a,b)=>Date.parse(a.occurredAt)-Date.parse(b.occurredAt)||a.id.localeCompare(b.id));
  const first=sorted[0];let last:string|null=null;let paid=0n,refunded=0n;
  for(const e of sorted){if(e.currency!==first.currency||e.periodFrom!==first.periodFrom||e.periodThrough!==first.periodThrough)throw Error('PROVIDER_RECORD_CONFLICT');
   if(last&&e.state!==last&&!transitions[e.category][last]?.includes(e.state))throw Error('PROVIDER_TRANSITION_DENIED');
   if(last===e.state&&e.basis==='gross')throw Error('PROVIDER_DUPLICATE_STATE');
   if(e.relatedEventId&&!sorted.some(x=>x.id===e.relatedEventId&&Date.parse(x.occurredAt)<=Date.parse(e.occurredAt)))throw Error('PROVIDER_RELATED_EVENT_DENIED');
   if(e.basis==='gross'&&['captured','completed','paid','finalized','payment-received'].includes(e.state))paid=BigInt(e.amountMinor);
   if(e.basis==='refund'){refunded+=BigInt(e.amountMinor);if(refunded>paid)throw Error('PROVIDER_REFUND_EXCEEDS_GROSS');}
   last=e.state;
  }
 }
 return parsed;
}
export function appendProviderRevenue(raw:unknown,candidate:unknown,scope:{organizationId:string;websiteId:string},now:string){const b=validateProviderRevenue(raw,scope,now);
 return validateProviderRevenue({...b,events:[...b.events,event.parse(candidate)]},scope,now);}
export type RevenueException={id:string;organizationId:string;websiteId:string;category:string;severity:'review'|'high';eventIds:string[];explanation:string;investigation:string;status:'open-local-review'};
export function reconcileProviderRevenue(raw:unknown,scope:{organizationId:string;websiteId:string},now:string){const b=validateProviderRevenue(raw,scope,now),groups=new Map<string,ProviderRevenueEvent[]>();
 for(const e of b.events){const key=recordKey(e);groups.set(key,[...(groups.get(key)??[]),e]);}
 const exceptions:RevenueException[]=[],rows=[];
 const flag=(key:string,category:string,events:ProviderRevenueEvent[],explanation:string,investigation:string,severity:'review'|'high'='review')=>
  exceptions.push({id:localFingerprint(key+category),...scope,category,severity,eventIds:events.map(e=>e.id),explanation,investigation,status:'open-local-review' as const});
 for(const [key,events] of groups){const sorted=[...events].sort((a,b)=>Date.parse(a.occurredAt)-Date.parse(b.occurredAt)||a.id.localeCompare(b.id));
  const last=sorted.at(-1)!;const settlements=sorted.filter(e=>e.settlementReference),gross=sorted.filter(e=>e.basis==='gross'&&['captured','completed','approved','paid','finalized','payment-received'].includes(e.state));
  const refunds=sorted.filter(e=>e.basis==='refund');
  const payout=sorted.filter(e=>e.basis==='payout'),fees=sorted.filter(e=>e.basis==='fee');
  if(gross.length>1&&new Set(gross.map(e=>e.amountMinor)).size>1)flag(key,'amount-conflict',sorted,'Conflicting gross amounts for one source record','Check corrected provider event and signed statement','high');
  if(['completed','captured','settled','paid','payment-received'].includes(last.state)&&!settlements.length)
   flag(key,'missing-settlement',sorted,'No independently checked settlement or payout reference','Obtain provider payout statement and bank matching');
  if(['approved','finalized','payment-issued'].includes(last.state))flag(key,'pending-payment-evidence',sorted,'Approval or finalized report is not received payment','Obtain payout and receipt evidence');
  if(['initiated','pending','authorized'].includes(last.state))flag(key,'missing-payment',sorted,'No captured or completed payment record','Inspect provider event delivery and transaction state');
  if(last.state==='disputed')flag(key,'dispute-open',sorted,'Disputed payment outcome unresolved','Investigate dispute and reversal','high');
  if(payout.length&&!gross.length&&last.category!=='affiliate')flag(key,'unmatched-payout',sorted,'Payout has no comparable gross record','Inspect source transactions and payout statement','high');
  if(fees.length&&gross.length&&fees.some(f=>BigInt(f.amountMinor)>BigInt(gross[0].amountMinor)))flag(key,'fee-discrepancy',sorted,'Reported fee exceeds comparable gross amount','Inspect fee basis and provider statement','high');
  if(payout.length&&gross.length){const expected=BigInt(gross.at(-1)!.amountMinor)-refunds.reduce((n,e)=>n+BigInt(e.amountMinor),0n)-fees.reduce((n,e)=>n+BigInt(e.amountMinor),0n);
   if(expected<0n||BigInt(payout.at(-1)!.amountMinor)!==expected)flag(key,'payout-discrepancy',sorted,'Local payout differs from gross less recorded refunds and fees','Check tax, reserve, aggregation and payout allocation before any conclusion','high');}
  const estimate=sorted.find(e=>e.basis==='estimate'),finalized=sorted.find(e=>e.state==='finalized');
  if(estimate&&finalized&&estimate.amountMinor!==finalized.amountMinor)flag(key,'estimate-final-difference',sorted,'Advertising estimate differs from finalized report','Review adjustments before payment matching');
  if(refunds.length&&gross.length===0)flag(key,'missing-original',sorted,'Refund has no captured original in this local package','Inspect original transaction and cross-report lineage','high');
  if(sorted.some(e=>e.basis==='fee')&&gross.length===0)flag(key,'fee-unmatched',sorted,'Fee has no comparable gross event','Obtain fee and settlement statements');
  const localIssues=exceptions.some(x=>x.eventIds.some(id=>events.some(e=>e.id===id)));
  const settlementReadiness=!gross.length?'missing-source-payment':!payout.length||!payout.at(-1)?.settlementReference?'missing-settlement-evidence':
   localIssues?'conflicting-local-evidence':'potential-local-match';
  rows.push({recordKey:key,provider:last.category,providerId:last.providerId,sourceRecordId:last.sourceRecordId,state:last.state,
   currency:last.currency,periodFrom:last.periodFrom,periodThrough:last.periodThrough,observationCount:events.length,
   status:localIssues?'unresolved-exception' as const:'potential-local-match' as const,settlementReadiness,
   certified:false,amountMinor:null as null});
 }
 return {rows,exceptions,providerCoverage:[...new Set(b.events.map(e=>e.category))].sort(),verifiedRevenue:'Unavailable' as const,
  certifiedReconciliation:false,requirements:['Independent provider account and resource binding','Issuer key custody and revocation','Settlement statement and payout matching','Refund, dispute, fee and tax review','Durable replay and event ordering']};
}
export function providerPortfolioCoverage(items:ProviderRevenueBundle[],organizationId:string,websiteIds:string[],now:string){
 if(new Set(websiteIds).size!==websiteIds.length)throw Error('PROVIDER_PORTFOLIO_DUPLICATE_SITE');const allowed=new Set(websiteIds),seen=new Set<string>();
 for(const b of items){if(b.organizationId!==organizationId||!allowed.has(b.websiteId)||seen.has(b.websiteId))throw Error('PROVIDER_PORTFOLIO_SCOPE_DENIED');
  validateProviderRevenue(b,{organizationId,websiteId:b.websiteId},now);seen.add(b.websiteId);}
 return websiteIds.map(websiteId=>{const b=items.find(x=>x.websiteId===websiteId);const result=reconcileProviderRevenue(b??emptyProviderRevenue({organizationId,websiteId}),{organizationId,websiteId},now);
  return {websiteId,providers:result.providerCoverage,events:b?.events.length??0,exceptions:result.exceptions.length,verifiedRevenue:'Unavailable' as const};});
}
export function prepareProviderReconciliationHandoff(raw:unknown,scope:{organizationId:string;websiteId:string},now:string){
 const r=reconcileProviderRevenue(raw,scope,now);if(!r.exceptions.length)throw Error('PROVIDER_HANDOFF_DENIED');
 const refs=[...new Set(r.exceptions.flatMap(x=>x.eventIds))].slice(0,30);
 return validateRevenueHandoff({id:`revenue:${scope.websiteId}:reconciliation-gap`,...scope,kind:'reconciliation-gap',title:'Review provider reconciliation gaps',
  reason:'Provider-shaped local records have unresolved financial evidence gaps',customerBenefit:'Accurate customer and portfolio reporting requires trusted settlement evidence',
  evidenceRefs:refs,priority:3,provenance:'unverified-manual',authority:'review-only',cost:'unknown',impact:'unknown'},scope);
}
export function exportProviderRevenue(raw:unknown,scope:{organizationId:string;websiteId:string},now:string){const bytes=JSON.stringify(validateProviderRevenue(raw,scope,now));
 if(new TextEncoder().encode(bytes).byteLength>250_000)throw Error('PROVIDER_PACKAGE_SIZE_DENIED');return bytes;}
export function importProviderRevenue(bytes:Uint8Array,scope:{organizationId:string;websiteId:string},now:string){if(!bytes.length||bytes.length>250_000)throw Error('PROVIDER_PACKAGE_SIZE_DENIED');
 return validateProviderRevenue(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)) as unknown,scope,now);}
export interface OfflineProviderAdapter {readonly category:ProviderCategory;normalize(raw:unknown,scope:{organizationId:string;websiteId:string},now:string):ProviderRevenueEvent}
/** Adapters only validate provider-shaped offline fixtures; they confer no authentication or settlement authority. */
export const offlineProviderAdapter=(category:ProviderCategory):OfflineProviderAdapter=>({category,normalize(raw,scope,now){const e=event.parse(raw);
 if(e.category!==category)throw Error('PROVIDER_ADAPTER_KIND_DENIED');validateProviderRevenue({...emptyProviderRevenue(scope),events:[e]},scope,now);return e;}});
