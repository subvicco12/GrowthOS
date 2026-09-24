import type { GrowthSignal, NextBestAction } from './growth-intelligence';
import { buildNextBestActions } from './growth-intelligence';

export interface GrowthWorkflowEvidence {siteId:string;capturedAt:string;signals:GrowthSignal[];actions:NextBestAction[];}
export function certifyGrowthWorkflow(siteId:string,signals:GrowthSignal[],capturedAt:string):GrowthWorkflowEvidence {
 if(!siteId.trim())throw new Error('GROWTH_SITE_REQUIRED');
 if(!Number.isFinite(Date.parse(capturedAt)))throw new Error('GROWTH_CAPTURE_TIME_REQUIRED');
 const scoped=signals.filter(s=>s.siteId===siteId);
 if(scoped.length!==signals.length)throw new Error('GROWTH_CROSS_SITE_EVIDENCE');
 for(const signal of scoped){
  if(!signal.evidence.length)throw new Error('GROWTH_EVIDENCE_REQUIRED');
  if(!signal.successMetric.trim())throw new Error('GROWTH_SUCCESS_METRIC_REQUIRED');
  for(const evidence of signal.evidence){if(!evidence.source.trim()||!Number.isFinite(Date.parse(evidence.observedAt)))throw new Error('GROWTH_EVIDENCE_INVALID');}
 }
 return {siteId,capturedAt,signals:scoped,actions:buildNextBestActions(scoped)};
}
