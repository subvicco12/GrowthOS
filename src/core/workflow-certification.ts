import { comparePackages, validateCompetitor, type CompetitorProfile, type PackageInventory } from './competitive-intelligence';
import { decideEntitlement, type EntitlementContext } from './entitlements';
import { summarizeRevenue, type RevenueEvent } from './revenue-intelligence';
import type { Entitlement } from './types';
export interface WorkflowCertificationInput { ours:PackageInventory; competitors:CompetitorProfile[]; entitlement:Entitlement; entitlementContext:EntitlementContext; revenueEvents:RevenueEvent[]; }
export interface WorkflowCertification { competitorEvidence:boolean; packageComparison:boolean; entitlementDecision:boolean; revenueMeasurement:boolean; }
export function certifyCoreWorkflows(input:WorkflowCertificationInput):WorkflowCertification {
 const valid=input.competitors.filter(c=>validateCompetitor(c).length===0);
 const gaps=comparePackages(input.ours,valid);
 const access=decideEntitlement(input.entitlement,input.entitlementContext);
 const revenue=summarizeRevenue(input.revenueEvents);
 return {competitorEvidence:valid.length>0,packageComparison:valid.length>0&&gaps.length>=0,entitlementDecision:typeof access.allowed==='boolean'&&!!access.reason,revenueMeasurement:revenue.length>0&&revenue.every(r=>Number.isFinite(r.conversionRate)&&Number.isFinite(r.revenuePerVisitor))};
}
