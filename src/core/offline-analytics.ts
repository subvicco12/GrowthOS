import { z } from 'zod';

const day=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v=>{const t=new Date(v+'T00:00:00Z');return !Number.isNaN(t.valueOf())&&t.toISOString().slice(0,10)===v;});
const count=z.number().int().nonnegative().safe();
const id=z.string().trim().min(1).max(128);
const url=z.string().url().max(2048).refine(v=>{const u=new URL(v);return u.protocol==='https:'&&!u.username&&!u.password&&!u.port;});
export const observationSchema=z.object({
  id:z.string().uuid(),organizationId:id,websiteId:id,source:id,sourceKind:z.enum(['manual-import','synthetic-fixture']),
  observedAt:z.string().datetime({offset:true}),day,visitorDefinition:z.enum(['unique-visitors','sessions']),
  attribution:z.enum(['last-touch','first-touch','unattributed']),currency:z.string().regex(/^[A-Z]{3}$/).nullable(),
  channel:z.enum(['organic','direct','referral','social','email','paid','other']).nullable(),
  landingPage:url.nullable(),contentId:id.nullable(),campaignId:id.nullable(),
  visits:count.nullable(),engagedVisits:count.nullable(),conversions:count.nullable(),
  searchImpressions:count.nullable(),searchClicks:count.nullable(),
  revenueMinor:count.nullable(),spendMinor:count.nullable(),costKind:z.enum(['ai','content','marketing','hosting','connector','operations']).nullable(),
  revenueKind:z.enum(['subscription','affiliate','advertising','lead','product','other']).nullable(),
  settled:z.literal(false)
}).strict();
export type AnalyticsObservation=z.infer<typeof observationSchema>;
export type AnalyticsScope={organizationId:string;websiteIds:string[];from:string;through:string};
export type AnalyticsProvider={kind:'unavailable';reason:string;fetch():Promise<never>};
export const unavailableAnalyticsProvider:AnalyticsProvider={kind:'unavailable',reason:'No independently verified analytics provider configured',
  async fetch(){throw Error('ANALYTICS_PROVIDER_UNAVAILABLE');}};
const ratio=(a:number|null,b:number|null)=>a===null||b===null||b===0?null:a/b;
const sum=(rows:AnalyticsObservation[],key:keyof AnalyticsObservation)=>{
  if(!rows.length||rows.some(r=>r[key]===null))return null;
  const values=rows.map(r=>r[key]).filter((v):v is number=>typeof v==='number');
  if(!values.length)return null;const total=values.reduce((a,b)=>a+b,0);
  if(!Number.isSafeInteger(total))throw Error('ANALYTICS_OVERFLOW');return total;
};
export function validateObservations(input:unknown,scope:{organizationId:string;websiteIds:string[]}):AnalyticsObservation[]{
  const records=z.array(observationSchema).max(500).parse(input);
  if(scope.websiteIds.length>250||new Set(scope.websiteIds).size!==scope.websiteIds.length||!scope.organizationId)throw Error('ANALYTICS_SCOPE_DENIED');
  const seen=new Set<string>(),measurementKeys=new Set<string>();
  for(const o of records){
    if(o.organizationId!==scope.organizationId||!scope.websiteIds.includes(o.websiteId))throw Error('ANALYTICS_SCOPE_DENIED');
    if(seen.has(o.id))throw Error('ANALYTICS_DUPLICATE_OBSERVATION');seen.add(o.id);
    const key=JSON.stringify([o.websiteId,o.source,o.day,o.channel,o.landingPage,o.contentId,o.campaignId,o.visitorDefinition,o.attribution]);
    if(measurementKeys.has(key))throw Error('ANALYTICS_DUPLICATE_MEASUREMENT');measurementKeys.add(key);
    if(o.engagedVisits!==null&&o.visits!==null&&o.engagedVisits>o.visits||
      o.conversions!==null&&o.visits!==null&&o.conversions>o.visits||
      o.searchClicks!==null&&o.searchImpressions!==null&&o.searchClicks>o.searchImpressions||
      (o.revenueMinor!==null&&!o.currency)||(o.spendMinor!==null&&!o.currency)||
      (o.revenueMinor!==null&&!o.revenueKind)||(o.spendMinor!==null&&!o.costKind)||
      (o.revenueMinor===null&&o.revenueKind!==null)||(o.spendMinor===null&&o.costKind!==null)||
      Date.parse(o.observedAt)<Date.parse(o.day+'T00:00:00Z')||Date.parse(o.observedAt)>Date.parse(o.day+'T23:59:59.999Z'))
      throw Error('ANALYTICS_MEASUREMENT_DENIED');
  }
  return records;
}
export function summarizeAnalytics(input:AnalyticsObservation[],scope:AnalyticsScope){
  day.parse(scope.from);day.parse(scope.through);if(scope.from>scope.through)throw Error('ANALYTICS_PERIOD_DENIED');
  const all=validateObservations(input,scope),rows=all.filter(r=>r.day>=scope.from&&r.day<=scope.through);
  const unique=(key:keyof AnalyticsObservation)=>new Set(rows.map(r=>r[key]).filter(v=>v!==null));
  const currencies=unique('currency'),definitions=unique('visitorDefinition'),attributions=unique('attribution'),sources=unique('source');
  const incompatible=currencies.size>1||definitions.size>1||attributions.size>1||sources.size>1;
  const warnings:string[]=[];
  if(!rows.length)warnings.push('No observations for this period');
  if(incompatible)warnings.push('Currency, source, visitor definition or attribution differs; aggregate financial and rate metrics unavailable');
  if(rows.some(r=>r.sourceKind==='synthetic-fixture'))warnings.push('Contains synthetic fixtures; not live performance');
  if(rows.some(r=>r.sourceKind==='manual-import'))warnings.push('Imported measurements are unverified');
  if(rows.some(r=>r.revenueMinor!==null))warnings.push('Reported revenue is attribution, not payment settlement');
  const visits=incompatible?null:sum(rows,'visits'),conversions=incompatible?null:sum(rows,'conversions');
  const revenueMinor=incompatible?null:sum(rows,'revenueMinor'),spendMinor=incompatible?null:sum(rows,'spendMinor');
  const impressions=incompatible?null:sum(rows,'searchImpressions'),clicks=incompatible?null:sum(rows,'searchClicks');
  const missingRevenue=rows.some(r=>r.revenueMinor===null),missingSpend=rows.some(r=>r.spendMinor===null);
  const roi=revenueMinor===null||spendMinor===null||missingRevenue||missingSpend||spendMinor===0?null:(revenueMinor-spendMinor)/spendMinor;
  const roas=revenueMinor===null||spendMinor===null||missingRevenue||missingSpend||spendMinor===0?null:revenueMinor/spendMinor;
  const byWebsite=scope.websiteIds.map(websiteId=>({websiteId,count:rows.filter(r=>r.websiteId===websiteId).length,
    visits:incompatible?null:sum(rows.filter(r=>r.websiteId===websiteId),'visits'),
    conversions:incompatible?null:sum(rows.filter(r=>r.websiteId===websiteId),'conversions')}));
  return {scope,observationCount:rows.length,provenance:rows.length?rows.some(r=>r.sourceKind==='synthetic-fixture')?'mixed-or-synthetic':'unverified-import':'unavailable',
    source:sources.size===1?[...sources][0]:null,
    currency:currencies.size===1&&typeof [...currencies][0]==='string'?[...currencies][0] as string:null,visitorDefinition:definitions.size===1?[...definitions][0]:null,
    attribution:attributions.size===1?[...attributions][0]:null,visits,engagedVisits:incompatible?null:sum(rows,'engagedVisits'),
    conversions,conversionRate:ratio(conversions,visits),searchImpressions:impressions,searchClicks:clicks,searchCtr:ratio(clicks,impressions),
    revenueMinor,spendMinor,costPerConversion:ratio(spendMinor,conversions),roi,roas,
    profitContributionMinor:roi===null?null:revenueMinor!-spendMinor!,warnings,byWebsite};
}
export function periodBuckets(rows:AnalyticsObservation[],scope:AnalyticsScope,frequency:'daily'|'weekly'|'monthly'){
  validateObservations(rows,scope);
  const buckets=new Map<string,AnalyticsObservation[]>();
  for(const row of rows.filter(r=>r.day>=scope.from&&r.day<=scope.through)){
    let key=row.day;if(frequency==='monthly')key=key.slice(0,7);
    if(frequency==='weekly'){const d=new Date(key+'T00:00:00Z');d.setUTCDate(d.getUTCDate()-(d.getUTCDay()+6)%7);key=d.toISOString().slice(0,10);}
    buckets.set(key,[...(buckets.get(key)??[]),row]);
  }
  return [...buckets].sort(([a],[b])=>a.localeCompare(b)).map(([period,records])=>{
    const compatible=['source','currency','visitorDefinition','attribution'].every(key=>new Set(records.map(r=>r[key as keyof AnalyticsObservation])).size===1);
    return {period,visits:compatible?sum(records,'visits'):null,conversions:compatible?sum(records,'conversions'):null,
      searchClicks:compatible?sum(records,'searchClicks'):null};});
}
export function compareReportingPeriods(rows:AnalyticsObservation[],scope:AnalyticsScope){
  day.parse(scope.from);day.parse(scope.through);if(scope.from>scope.through)throw Error('ANALYTICS_PERIOD_DENIED');
  const length=Math.round((Date.parse(scope.through+'T00:00:00Z')-Date.parse(scope.from+'T00:00:00Z'))/86400000)+1;
  if(length>366)throw Error('ANALYTICS_PERIOD_TOO_LONG');
  const previousThrough=new Date(Date.parse(scope.from+'T00:00:00Z')-86400000).toISOString().slice(0,10);
  const previousFrom=new Date(Date.parse(scope.from+'T00:00:00Z')-length*86400000).toISOString().slice(0,10);
  const current=summarizeAnalytics(rows,scope),previous=summarizeAnalytics(rows,{...scope,from:previousFrom,through:previousThrough});
  const comparable=current.currency===previous.currency&&current.source===previous.source&&current.visitorDefinition===previous.visitorDefinition&&
    current.attribution===previous.attribution&&current.observationCount>0&&previous.observationCount>0;
  return {current,previous,comparable,
    visitChange:comparable&&current.visits!==null&&previous.visits!==null?current.visits-previous.visits:null,
    conversionChange:comparable&&current.conversions!==null&&previous.conversions!==null?current.conversions-previous.conversions:null};
}
export function performanceOpportunities(rows:AnalyticsObservation[],scope:AnalyticsScope){
  const report=summarizeAnalytics(rows,scope),ideas:{category:string;reason:string;action:string;priority:number;evidenceIds:string[];
    impact:'unknown';cost:'unknown';authority:'review-only'}[]=[];
  const selected=rows.filter(r=>r.day>=scope.from&&r.day<=scope.through);
  const add=(category:string,reason:string,action:string,priority:number)=>ideas.push({category,reason,action,priority,
    evidenceIds:selected.map(r=>r.id),impact:'unknown',cost:'unknown',authority:'review-only'});
  if(!report.observationCount)return ideas;
  if(report.searchImpressions!==null&&report.searchImpressions>=100&&report.searchCtr!==null&&report.searchCtr<.02)
    add('seo','Imported search CTR below 2% for this period','Review query intent, title and snippet with independently verified search evidence.',3);
  if(report.visits!==null&&report.visits>=100&&report.conversionRate!==null&&report.conversionRate<.01)
    add('conversion','Imported conversion rate below 1% for this period','Review funnel definitions, landing pages and calls to action.',2);
  if(report.revenueMinor===null||report.spendMinor===null)
    add('measurement','Revenue or cost coverage unavailable','Complete comparable source measurements before ROI planning.',4);
  return ideas.sort((a,b)=>b.priority-a.priority||a.category.localeCompare(b.category));
}
