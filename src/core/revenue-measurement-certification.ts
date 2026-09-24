import { summarizeRevenue, type RevenueEvent, type RevenueSummary } from './revenue-intelligence';
export interface DatedRevenueEvent extends RevenueEvent { observedAt:string; attributionRef:string; }
export interface RevenueMeasurementEvidence {siteId:string;capturedAt:string;events:DatedRevenueEvent[];summary:RevenueSummary;}
export function certifyRevenueMeasurement(siteId:string,events:DatedRevenueEvent[],capturedAt:string):RevenueMeasurementEvidence {
 if(!siteId.trim())throw new Error('REVENUE_SITE_REQUIRED');
 if(!Number.isFinite(Date.parse(capturedAt)))throw new Error('REVENUE_CAPTURE_TIME_REQUIRED');
 if(!events.length)throw new Error('REVENUE_EVIDENCE_REQUIRED');
 for(const event of events){
  if(event.siteId!==siteId)throw new Error('REVENUE_CROSS_SITE_EVIDENCE');
  if(!event.source.trim()||!event.attributionRef.trim()||!Number.isFinite(Date.parse(event.observedAt)))throw new Error('REVENUE_ATTRIBUTION_EVIDENCE_INVALID');
  if(![event.visitors,event.conversions,event.revenueUsd].every(Number.isFinite))throw new Error('REVENUE_METRIC_INVALID');
 }
 const summary=summarizeRevenue(events)[0];
 if(!summary||![summary.conversionRate,summary.revenuePerVisitor,summary.revenueUsd].every(Number.isFinite))throw new Error('REVENUE_SUMMARY_INVALID');
 return {siteId,capturedAt,events,summary};
}
