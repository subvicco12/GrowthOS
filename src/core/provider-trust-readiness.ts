import {reconcileProviderRevenue,validateProviderRevenue,type ProviderRevenueBundle,type ProviderCategory} from './local-provider-revenue';
const requirements:Record<ProviderCategory,string[]>={
 paddle:['Authenticated merchant identity','Current webhook signing key and revocation','Transaction-to-payout allocation','Refunds, disputes and fees'],
 stripe:['Authenticated account identity','Current event signing key and revocation','Balance transaction and payout mapping','Refunds, disputes and fees'],
 'payment-other':['Configured issuer and key custody','Payout and bank receipt mapping'],
 adsense:['Authorized publisher property','Finalized earnings statement','Payment issued and bank receipt'],
 'advertising-other':['Authorized property','Finalized network statement','Payment receipt'],
 affiliate:['Approved network and account','Commission approval and reversal history','Payout and receipt'],
 woocommerce:['Authorized store identity','Order and refund provenance','Processor settlement reconciliation'],
 'commerce-other':['Authorized store','Order and payout mapping'],
 'lead-generation':['Authorized lead source','Qualified conversion evidence','Cash receipt'],
 'digital-product':['Authorized sales source','Order/refund evidence','Cash receipt'],
 'service-payment':['Authorized billing source','Invoice and receipt reconciliation'],
 manual:['Independent source and owner evidence','Receipt and settlement evidence']};
export function providerIdentityReadiness(raw:unknown,scope:{organizationId:string;websiteId:string},now:string){
 const b=validateProviderRevenue(raw,scope,now),reconciliation=reconcileProviderRevenue(b,scope,now);
 const keys=new Map<string,{category:ProviderCategory;providerId:string;accountId:string;resourceId:string;eventCount:number;lastEventAt:string}>();
 for(const e of b.events){const key=JSON.stringify([e.category,e.providerId,e.accountId,e.resourceId]);const old=keys.get(key);
  keys.set(key,{category:e.category,providerId:e.providerId,accountId:e.accountId,resourceId:e.resourceId,
   eventCount:(old?.eventCount??0)+1,lastEventAt:!old||e.occurredAt>old.lastEventAt?e.occurredAt:old.lastEventAt});}
 return {identities:[...keys.values()].map(x=>({...x,identityState:'claimed-unverified' as const,signatureState:'unavailable' as const,
  settlementState:'unavailable' as const,requirements:requirements[x.category]})),exceptionCount:reconciliation.exceptions.length,
  certified:false,verifiedRevenue:'Unavailable' as const};
}
export function portfolioProviderReadiness(bundles:ProviderRevenueBundle[],organizationId:string,websiteIds:string[],now:string){
 const known=new Set(websiteIds),seen=new Set<string>();if(known.size!==websiteIds.length)throw Error('PROVIDER_PORTFOLIO_DUPLICATE_SITE');
 for(const b of bundles){if(b.organizationId!==organizationId||!known.has(b.websiteId)||seen.has(b.websiteId))throw Error('PROVIDER_PORTFOLIO_SCOPE_DENIED');seen.add(b.websiteId);}
 return websiteIds.map(websiteId=>{const b=bundles.find(x=>x.websiteId===websiteId);
  const r=providerIdentityReadiness(b??{format:'growthos-provider-revenue-preview',version:1,organizationId,websiteId,events:[],authority:'none'},
   {organizationId,websiteId},now);
  return {websiteId,identityClaims:r.identities.length,exceptions:r.exceptionCount,verifiedRevenue:r.verifiedRevenue,certified:false};});
}
