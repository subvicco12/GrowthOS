import { certifyCompletionGates, type CompletionGateEvidence, type CompletionGateResult } from './completion-gates';
import {
 hasPilotDiscoveryEvidence,hasCompetitorSnapshotEvidence,hasPackageRecommendationEvidence,hasEntitlementEnforcementEvidence,
 type DiscoveryGateRecord,type CompetitorGateRecord,type PackageGateRecord,type EntitlementGateRecord
} from './preproduction-evidence';

export const PREPRODUCTION_GATE_KEYS: readonly (keyof CompletionGateEvidence)[]=['customAdminResponsive','portfolioSixSites','futureSiteConnector','pilotDiscoveryEvidence','competitorSnapshots','packageRecommendations','entitlementEnforcement','realGrowthWorkflows','githubTraceability','securityAuditRollback','productionSmokeTests','externalBlockersLabeled'];

export interface StructuredPreproductionEvidence {
 gates:Partial<CompletionGateEvidence>;
 discovery?:DiscoveryGateRecord;
 competitors?:CompetitorGateRecord;
 packages?:PackageGateRecord;
 entitlements?:EntitlementGateRecord;
}

const structuredGateValues=(input:StructuredPreproductionEvidence):Partial<CompletionGateEvidence>=>({
 ...input.gates,
 pilotDiscoveryEvidence:hasPilotDiscoveryEvidence(input.discovery),
 competitorSnapshots:hasCompetitorSnapshotEvidence(input.competitors),
 packageRecommendations:hasPackageRecommendationEvidence(input.packages),
 entitlementEnforcement:hasEntitlementEnforcementEvidence(input.entitlements),
});

export function evaluatePreproductionEvidence(input:StructuredPreproductionEvidence):{complete:boolean;results:CompletionGateResult[];missing:(keyof CompletionGateEvidence)[]}{
 const evidence=structuredGateValues(input);
 const missing=PREPRODUCTION_GATE_KEYS.filter(k=>evidence[k]!==true);
 const normalized=Object.fromEntries(PREPRODUCTION_GATE_KEYS.map(k=>[k,evidence[k]===true])) as unknown as CompletionGateEvidence;
 const results=certifyCompletionGates(normalized);
 return{complete:missing.length===0,results,missing};
}
export function productionVerificationRequired(results:CompletionGateResult[]):boolean{return results.some(r=>r.key==='productionSmokeTests'&&r.status==='blocked');}
