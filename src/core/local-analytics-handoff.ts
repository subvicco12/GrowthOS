import {performanceOpportunities,validateObservations,type AnalyticsObservation,type AnalyticsScope} from './offline-analytics';
export type AnalyticsReviewIdea=ReturnType<typeof performanceOpportunities>[number];
export type AnalyticsHandoff={organizationId:string;websiteId:string;from:string;through:string;originRef:string;
 category:string;problem:string;action:string;evidenceIds:string[];provenance:'synthetic-or-mixed'|'unverified-import';cost:'unknown';impact:'unknown';authority:'review-only'};
/** Recompute the rule from scoped observations; caller-supplied ideas cannot assert authority. */
export function prepareAnalyticsHandoff(rows:AnalyticsObservation[],scope:AnalyticsScope,idea:AnalyticsReviewIdea):AnalyticsHandoff{
 if(scope.websiteIds.length!==1||!scope.organizationId||!scope.websiteIds[0])throw Error('ANALYTICS_HANDOFF_WEBSITE_REQUIRED');
 const selected=validateObservations(rows,scope);
 if(selected.some(r=>r.websiteId!==scope.websiteIds[0]))throw Error('ANALYTICS_HANDOFF_SCOPE_DENIED');
 const match=performanceOpportunities(selected,scope).find(o=>o.category===idea.category&&o.reason===idea.reason&&
  o.action===idea.action&&o.authority==='review-only'&&JSON.stringify(o.evidenceIds)===JSON.stringify(idea.evidenceIds));
 if(!match||!match.evidenceIds.length||match.evidenceIds.length>30)throw Error('ANALYTICS_HANDOFF_EVIDENCE_DENIED');
 return {organizationId:scope.organizationId,websiteId:scope.websiteIds[0],from:scope.from,through:scope.through,
  originRef:`${scope.websiteIds[0]}:${match.category}:${scope.from}`,category:match.category,problem:match.reason,action:match.action,
  evidenceIds:[...match.evidenceIds],provenance:selected.some(r=>r.sourceKind==='synthetic-fixture')?'synthetic-or-mixed':'unverified-import',
  cost:'unknown',impact:'unknown',authority:'review-only'};
}
