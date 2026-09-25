import { certifyCompletionGates, type CompletionGateEvidence, type CompletionGateResult } from './completion-gates';
import {
 hasPilotDiscoveryEvidence,hasCompetitorSnapshotEvidence,hasPackageRecommendationEvidence,hasEntitlementEnforcementEvidence,
 type DiscoveryGateRecord,type CompetitorGateRecord,type PackageGateRecord,type EntitlementGateRecord
} from './preproduction-evidence';
import type { GrowthWorkflowEvidence } from './growth-workflow-certification';
import { certifySecurityGate, type SecurityGateEvidence } from './security-gate-certification';
import {hasResponsiveAdminEvidence,hasConnectorContractEvidence,hasGithubTraceabilityEvidence,hasExternalBlockerEvidence,type ResponsiveAdminEvidence,type ConnectorContractEvidence,type GithubTraceabilityEvidence,type ExternalBlockerEvidence} from './final-preproduction-evidence';

export const PREPRODUCTION_GATE_KEYS: readonly (keyof CompletionGateEvidence)[]=['customAdminResponsive','portfolioSixSites','futureSiteConnector','pilotDiscoveryEvidence','competitorSnapshots','packageRecommendations','entitlementEnforcement','realGrowthWorkflows','githubTraceability','securityAuditRollback','productionSmokeTests','externalBlockersLabeled'];

export interface StructuredPreproductionEvidence {
 gates:Partial<CompletionGateEvidence>;
 discovery?:DiscoveryGateRecord;
 competitors?:CompetitorGateRecord;
 packages?:PackageGateRecord;
 entitlements?:EntitlementGateRecord;
 growthWorkflow?:GrowthWorkflowEvidence;
 security?:SecurityGateEvidence;
 responsiveAdmin?:ResponsiveAdminEvidence;
 connectorContract?:ConnectorContractEvidence;
 githubTrace?:GithubTraceabilityEvidence;
 externalBlockers?:ExternalBlockerEvidence[];
}

const hasGrowthWorkflowEvidence=(record:GrowthWorkflowEvidence|undefined):boolean=>{
 if(!record||!record.siteId.trim()||!Number.isFinite(Date.parse(record.capturedAt))||record.signals.length===0||record.actions.length===0)return false;
 return record.signals.every(signal=>signal.siteId===record.siteId&&signal.evidence.length>0&&!!signal.successMetric.trim())&&record.actions.every(action=>!!action.signalId&&action.evidenceCount>0);
};

const structuredGateValues=(input:StructuredPreproductionEvidence):Partial<CompletionGateEvidence>=>({
 ...input.gates,
 customAdminResponsive:hasResponsiveAdminEvidence(input.responsiveAdmin),
 futureSiteConnector:hasConnectorContractEvidence(input.connectorContract),
 githubTraceability:hasGithubTraceabilityEvidence(input.githubTrace),
 externalBlockersLabeled:hasExternalBlockerEvidence(input.externalBlockers),
 pilotDiscoveryEvidence:hasPilotDiscoveryEvidence(input.discovery),
 competitorSnapshots:hasCompetitorSnapshotEvidence(input.competitors),
 packageRecommendations:hasPackageRecommendationEvidence(input.packages),
 entitlementEnforcement:hasEntitlementEnforcementEvidence(input.entitlements),
 realGrowthWorkflows:hasGrowthWorkflowEvidence(input.growthWorkflow),
 securityAuditRollback:input.security?certifySecurityGate(input.security).passed:false,
});

export function evaluatePreproductionEvidence(input:StructuredPreproductionEvidence):{complete:boolean;results:CompletionGateResult[];missing:(keyof CompletionGateEvidence)[]}{
 const evidence=structuredGateValues(input);
 const missing=PREPRODUCTION_GATE_KEYS.filter(k=>evidence[k]!==true);
 const normalized=Object.fromEntries(PREPRODUCTION_GATE_KEYS.map(k=>[k,evidence[k]===true])) as unknown as CompletionGateEvidence;
 const results=certifyCompletionGates(normalized);
 return{complete:missing.length===0,results,missing};
}
export function productionVerificationRequired(results:CompletionGateResult[]):boolean{return results.some(r=>r.key==='productionSmokeTests'&&r.status==='blocked');}
