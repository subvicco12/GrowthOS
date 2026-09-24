import type { RecommendationRecord, RecommendationStatus } from './recommendations';
export interface RecommendationDetail extends RecommendationRecord {
 decisionRequired:boolean;
 allowedTransitions:RecommendationStatus[];
 evidenceSummary:string[];
 riskSummary:string;
 executionReady:boolean;
}
const transitions:Record<RecommendationStatus,RecommendationStatus[]>={proposed:['approved','rejected','deferred'],approved:['implemented','rejected','deferred'],rejected:[],deferred:['approved','rejected'],implemented:['verified'],verified:[]};
export function buildRecommendationDetail(record:RecommendationRecord):RecommendationDetail{
 return {
  ...record,
  decisionRequired:record.status==='proposed'&&record.approvalClass!=='green',
  allowedTransitions:[...transitions[record.status]],
  evidenceSummary:record.evidence.slice(0,8),
  riskSummary:record.risk>=5?'High risk — explicit approval required':record.risk>=3?'Moderate risk — review before execution':'Low risk',
  executionReady:(record.approvalClass==='green'&&(record.status==='proposed'||record.status==='approved'))||(record.approvalClass!=='green'&&record.status==='approved')
 };
}
export function assertDetailTransition(record:RecommendationRecord,to:RecommendationStatus):void{
 if(!transitions[record.status].includes(to))throw new Error('INVALID_RECOMMENDATION_TRANSITION');
}
