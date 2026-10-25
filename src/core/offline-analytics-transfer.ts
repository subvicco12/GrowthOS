import { z } from 'zod';
import { observationSchema, validateObservations, type AnalyticsObservation } from './offline-analytics';

const packageSchema=z.object({format:z.literal('growthos-offline-analytics'),version:z.literal(1),
  organizationId:z.string().min(1).max(128),websiteIds:z.array(z.string().min(1).max(128)).min(1).max(250),
  definition:z.literal('counts and integer minor-unit reported amounts; no payment settlement'),
  observations:z.array(observationSchema).max(500)}).strict();
export type AnalyticsPackage=z.infer<typeof packageSchema>;
const maxBytes=500_000;
export function importAnalytics(bytes:Uint8Array,scope:{organizationId:string;websiteIds:string[]}):AnalyticsPackage{
  if(!bytes.length||bytes.length>maxBytes)throw Error('ANALYTICS_IMPORT_SIZE_DENIED');
  const value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)) as unknown;
  const pkg=packageSchema.parse(value);
  if(pkg.organizationId!==scope.organizationId||pkg.websiteIds.length!==scope.websiteIds.length||
    pkg.websiteIds.some(id=>!scope.websiteIds.includes(id))||new Set(pkg.websiteIds).size!==pkg.websiteIds.length)
    throw Error('ANALYTICS_IMPORT_SCOPE_DENIED');
  validateObservations(pkg.observations,scope);return pkg;
}
export function exportAnalytics(observations:AnalyticsObservation[],scope:{organizationId:string;websiteIds:string[]}):string{
  const pkg:AnalyticsPackage={format:'growthos-offline-analytics',version:1,organizationId:scope.organizationId,
    websiteIds:[...scope.websiteIds],definition:'counts and integer minor-unit reported amounts; no payment settlement',
    observations:validateObservations(observations,scope)};
  const output=JSON.stringify(pkg);if(new TextEncoder().encode(output).length>maxBytes)throw Error('ANALYTICS_EXPORT_SIZE_DENIED');return output;
}
const columns=['id','websiteId','day','source','sourceKind','visitorDefinition','attribution','currency','channel',
  'visits','engagedVisits','conversions','searchImpressions','searchClicks','revenueMinor','spendMinor','campaignId','contentId'] as const;
const csv=(value:unknown)=>{const s=value===null?'':String(value);
  const safe=/^[\s\uFEFF]*[=+\-@\t\r\n]/u.test(s)?"'"+s:s;
  return '"'+safe.replaceAll('"','""')+'"';};
export function exportAnalyticsCsv(rows:AnalyticsObservation[],scope:{organizationId:string;websiteIds:string[]}):string{
  validateObservations(rows,scope);
  return [columns.map(csv).join(','),...rows.map(r=>columns.map(k=>csv(r[k])).join(','))].join('\r\n')+'\r\n';
}
