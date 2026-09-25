import type { CompletionGateEvidence, CompletionGateResult } from './completion-gates';
import { evaluatePreproductionEvidence, productionVerificationRequired, type StructuredPreproductionEvidence } from './preproduction-completion';

export type ReadinessStage='preproduction_incomplete'|'ready_for_production_connection'|'production_verification_required'|'complete';

export interface ReadinessReport {
 stage:ReadinessStage;
 complete:boolean;
 passed:(keyof CompletionGateEvidence)[];
 failed:(keyof CompletionGateEvidence)[];
 blocked:(keyof CompletionGateEvidence)[];
 needsConnection:boolean;
 results:CompletionGateResult[];
}

export function buildReadinessReport(input:StructuredPreproductionEvidence):ReadinessReport{
 const evaluation=evaluatePreproductionEvidence(input);
 const passed=evaluation.results.filter(r=>r.status==='pass').map(r=>r.key);
 const failed=evaluation.results.filter(r=>r.status==='fail').map(r=>r.key);
 const blocked=evaluation.results.filter(r=>r.status==='blocked').map(r=>r.key);
 const productionBlocked=productionVerificationRequired(evaluation.results);
 const stage:ReadinessStage=evaluation.complete?'complete':failed.length>0?'preproduction_incomplete':productionBlocked?'production_verification_required':'ready_for_production_connection';
 return{stage,complete:evaluation.complete,passed,failed,blocked,needsConnection:productionBlocked&&failed.length===0,results:evaluation.results};
}
