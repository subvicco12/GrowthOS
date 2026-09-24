import { recommendationFingerprint } from './recommendation-dedupe';
import type { RankedOpportunity } from './opportunities';
export interface FreshnessPolicy { staleAfterHours:number; suppressDeferred:boolean; }
export interface RecommendationCandidate extends RankedOpportunity { status?:'proposed'|'approved'|'rejected'|'deferred'|'implemented'|'verified'; evidenceCapturedAt?:string; }
export interface FreshnessDecision { fingerprint:string; action:'create'|'refresh'|'suppress'|'skip'; reason:string; }
export function decideRecommendationFreshness(candidate:RecommendationCandidate,existing:RecommendationCandidate|undefined,policy:FreshnessPolicy,now=new Date()):FreshnessDecision {
 const fingerprint=recommendationFingerprint(candidate);
 if(!existing)return {fingerprint,action:'create',reason:'NO_ACTIVE_MATCH'};
 if(policy.suppressDeferred&&existing.status==='deferred')return {fingerprint,action:'suppress',reason:'DEFERRED_MATCH'};
 const captured=existing.evidenceCapturedAt?Date.parse(existing.evidenceCapturedAt):NaN;
 if(Number.isFinite(captured)&&(now.getTime()-captured)<policy.staleAfterHours*3600000)return {fingerprint,action:'skip',reason:'EVIDENCE_FRESH'};
 return {fingerprint,action:'refresh',reason:'EVIDENCE_STALE'};
}
