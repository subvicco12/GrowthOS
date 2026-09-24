export type CompletionGateStatus='pass'|'fail'|'blocked';
export interface CompletionGateEvidence { customAdminResponsive:boolean; portfolioSixSites:boolean; futureSiteConnector:boolean; pilotDiscoveryEvidence:boolean; competitorSnapshots:boolean; packageRecommendations:boolean; entitlementEnforcement:boolean; realGrowthWorkflows:boolean; githubTraceability:boolean; securityAuditRollback:boolean; productionSmokeTests:boolean; externalBlockersLabeled:boolean; }
export interface CompletionGateResult { key:keyof CompletionGateEvidence; status:CompletionGateStatus; reason:string; }
const productionOnly=new Set<keyof CompletionGateEvidence>(['productionSmokeTests']);
export function certifyCompletionGates(e:CompletionGateEvidence):CompletionGateResult[]{return (Object.keys(e) as (keyof CompletionGateEvidence)[]).map(key=>({key,status:e[key]?'pass':productionOnly.has(key)?'blocked':'fail',reason:e[key]?'Evidence supplied':productionOnly.has(key)?'Requires production deployment and post-deployment verification':'Required completion evidence is missing'}));}
export function completionReady(results:CompletionGateResult[]):boolean{return results.every(r=>r.status==='pass');}
