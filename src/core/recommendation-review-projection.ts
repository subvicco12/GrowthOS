/** Candidate 016 read shape. All records are untrusted until scoped by an authenticated API. */
export type RecommendationProjection = {
  id:string; organizationId:string; websiteId:string; category:'seo'|'content'|'conversion'|'usability'|'feature_review'|'monetization';
  title:string; problem:string; proposal:string; expectedBenefit:string; priority:number;
  confidence:'observed_limited'|'manual_unverified'|'independently_verified';
  effort:'unknown'|'low'|'medium'|'high'; costMinor:number|null; currency:string|null;
  risk:'review_required'|'low'|'medium'|'high'; evidenceHash:string; observedAt:string;
  expiresAt:string; revokedAt:string|null; state:'proposed'|'accepted_for_planning'|'rejected'|'deferred'|'expired'|'revoked'; revision:number;
  sources:{id:string;kind:string;url:string;hash:string;observedAt:string;expiresAt:string}[];
  history:{id:string;decision:string;reason:string;actorId:string;at:string;revision:number}[];
};
export type ReviewPage={organizationId:string;websiteId:string;items:RecommendationProjection[];nextCursor:string|null;
  reviewAvailable:true};
export type ReviewFilter={category:string;state:string};
export function filterReviewPage(page:ReviewPage, filter:ReviewFilter, now:string):RecommendationProjection[] {
  const clock=Date.parse(now);
  if(!Number.isFinite(clock))throw Error('REVIEW_CLOCK_UNAVAILABLE');
  if(!page.reviewAvailable||!page.organizationId||!page.websiteId||page.items.length>250)throw Error('REVIEW_PROJECTION_INVALID');
  const ids=new Set<string>();
  for(const item of page.items){
    if(item.organizationId!==page.organizationId||item.websiteId!==page.websiteId||ids.has(item.id)||
      !/^[0-9a-f]{64}$/.test(item.evidenceHash)||!Number.isSafeInteger(item.revision)||item.revision<0||
      !Number.isFinite(Date.parse(item.expiresAt))||!Number.isInteger(item.priority)||item.priority<1||item.priority>5)
      throw Error('REVIEW_PROJECTION_SCOPE_OR_DATA_INVALID');
    ids.add(item.id);
  }
  return page.items.filter(item=>(filter.category==='all'||item.category===filter.category)&&
    (filter.state==='all'||item.state===filter.state));
}
export function evidenceLabel(item:RecommendationProjection, now:string):string {
  const clock=Date.parse(now),expiry=Date.parse(item.expiresAt);
  if(!Number.isFinite(clock)||!Number.isFinite(expiry))return 'Evidence unavailable';
  if(item.revokedAt)return 'Revoked evidence';
  if(expiry<=clock)return 'Expired evidence';
  return item.confidence==='independently_verified'?'Independently verified evidence':
    item.confidence==='manual_unverified'?'Unverified manual evidence':'Limited observation';
}
