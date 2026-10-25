import type { ManualRecommendation } from './manual-intelligence-preview';

export type DraftChannel = 'blog' | 'landing_page' | 'seo_metadata' | 'social' | 'video_script' | 'youtube_plan' | 'instagram_plan' | 'email';
export type PlanningIdea = ManualRecommendation & { id: string; priority: number; evidence: 'unverified-manual';
  effort: 'unestimated'; cost: 'unknown'; impact: 'unestimated'; status: 'local-preview' };
export type LocalPlan = { organizationId: string; websiteId: string; title: string; ideas: PlanningIdea[];
  dependencies: string[]; estimatedCost: 'unknown'; approval: 'not-requested'; persistence: 'none' };

const weights: Record<ManualRecommendation['category'], number> = { seo: 4, content: 3, conversion: 2, feature_review: 1 };
function validUrl(raw: string): boolean {
  try { const u = new URL(raw); return u.protocol === 'https:' && !u.username && !u.password && !u.port; }
  catch { return false; }
}
/** Only a local planning projection of already scoped manual preview results. */
export function prepareLocalPlan(scope: { organizationId: string; websiteId: string },
  recommendations: ManualRecommendation[], selected: string[], title: string): LocalPlan {
  if (!scope.organizationId || !scope.websiteId || title.trim().length < 3 || title.length > 120 ||
      recommendations.length > 100 || selected.length > 20 || new Set(selected).size !== selected.length)
    throw Error('PLAN_INPUT_DENIED');
  const ideas = recommendations.map((r, index) => {
    if (!Object.hasOwn(weights, r.category) || !r.title.trim() || r.title.length > 200 ||
        !r.rationale.trim() || r.rationale.length > 2000 || !validUrl(r.evidenceUrl)) throw Error('PLAN_EVIDENCE_DENIED');
    const id = `${scope.organizationId}:${scope.websiteId}:${index}`;
    return { ...r, id, priority: weights[r.category], evidence: 'unverified-manual' as const,
      effort: 'unestimated' as const, cost: 'unknown' as const, impact: 'unestimated' as const,
      status: 'local-preview' as const };
  });
  const byId = new Map(ideas.map(i => [i.id, i]));
  if (byId.size !== ideas.length || selected.some(id => !byId.has(id))) throw Error('PLAN_SCOPE_DENIED');
  return { ...scope, title: title.trim(), ideas: selected.map(id => byId.get(id)!).sort((a,b) =>
    b.priority - a.priority || a.id.localeCompare(b.id)), dependencies: [
      'Verify source evidence and website ownership', 'Estimate effort, cost and expected impact',
      'Obtain current budget and explicit human approval'], estimatedCost: 'unknown',
    approval: 'not-requested', persistence: 'none' };
}

const channelTasks: Record<DraftChannel, string[]> = {
  blog: ['Research sources and rights', 'Outline and factual claims', 'Editorial and originality review'],
  landing_page: ['Audience and proposition', 'Evidence for claims', 'Accessible conversion path'],
  seo_metadata: ['Review page intent', 'Propose title and description', 'Check canonical and indexing'],
  social: ['Platform policy and rights', 'Caption and visual brief', 'Disclosure and review'],
  video_script: ['Storyboard and source notes', 'Script and asset rights', 'Captions and review'],
  youtube_plan: ['Audience and episode outline', 'Thumbnail and music rights', 'Metadata and policy review'],
  instagram_plan: ['Format and storyboard', 'Caption and asset rights', 'Accessibility and policy review'],
  email: ['Consent and audience', 'Subject and body outline', 'Unsubscribe and legal review']
};
export function prepareContentBrief(plan: LocalPlan, ideaId: string, channel: DraftChannel) {
  const idea = plan.ideas.find(i => i.id === ideaId);
  if (!idea || !Object.hasOwn(channelTasks, channel) || plan.persistence !== 'none' ||
      idea.evidence !== 'unverified-manual') throw Error('BRIEF_SCOPE_DENIED');
  return { channel, organizationId: plan.organizationId, websiteId: plan.websiteId, ideaId,
    workingTitle: idea.title, source: idea.evidenceUrl, problem: idea.rationale,
    checklist: [...channelTasks[channel], 'Verify evidence freshness', 'Request human approval before scheduling'],
    state: 'unsaved-local-outline' as const, publication: 'disabled' as const };
}
