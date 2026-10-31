import { z } from 'zod';
import { previewInput, manualIntelligencePreview } from './manual-intelligence-preview';

export const workflowScope = z.object({ organizationId: z.string().uuid(), websiteId: z.string().uuid() }).strict();
const scope = workflowScope.shape;
export const ownershipAction = z.discriminatedUnion('action', [
  z.object({ ...scope, action: z.literal('issue') }).strict(),
  z.object({ ...scope, action: z.literal('verify'), challengeId: z.string().uuid(), token: z.string().regex(/^[A-Za-z0-9_-]{43}$/) }).strict()
]);
export const createAnalysisInput = z.object({ ...scope, requestKey: z.string().uuid(),
  sourceLabel: z.string().trim().min(1).max(200), observedAt: z.string().datetime({ offset: true }),
  runAfter: z.string().datetime({ offset: true }), evidence: previewInput }).strict().refine(x => x.websiteId === x.evidence.websiteId);
export type CreateAnalysis = z.infer<typeof createAnalysisInput>;
export const analysisAction = z.discriminatedUnion('action', [
  z.object({ ...scope, jobId: z.string().uuid(), action: z.enum(['run','retry','cancel']) }).strict(),
  z.object({ ...scope, jobId: z.string().uuid(), action: z.literal('schedule'), runAfter: z.string().datetime({ offset: true }) }).strict()
]);
export type AnalysisAction = z.infer<typeof analysisAction>;
export function assertObservationTime(observedAt: string, runAfter: string, now: number) {
  if (!Number.isFinite(now) || !Number.isFinite(Date.parse(observedAt)) || !Number.isFinite(Date.parse(runAfter)) || Date.parse(observedAt) > now + 300000 || Date.parse(observedAt) < now - 7 * 86400000 ||
    Date.parse(runAfter) > now + 30 * 86400000 || Date.parse(runAfter) < now - 300000) throw Error('INVALID_OBSERVATION_TIME');
}
export function analyzeManualEvidence(input: CreateAnalysis, domain: string) {
  const result = manualIntelligencePreview(input.evidence, domain);
  return { ...result, sourceLabel: input.sourceLabel, observedAt: input.observedAt,
    competitors: input.evidence.competitors ?? [], externalRequests: 0, costMinor: '0',
    recommendations: result.recommendations.map(item => ({ ...item,
      priority: item.category === 'seo' ? 'high' as const : item.category === 'feature_review' ? 'review' as const : 'medium' as const })) };
}
export type AnalysisResult = ReturnType<typeof analyzeManualEvidence>;
export type AnalysisJob = { id: string; status: string; sourceLabel: string; observedAt: string; runAfter: string;
  attempts: number; errorCode: string | null; approvalId: string; approvalStatus: string; result: AnalysisResult | null };
export type PersistedRecommendation = { id: string; jobId: string; category: string; title: string; rationale: string;
  evidenceUrl: string; priority: string; approvalId: string; status: string };
export type WorkflowEvent = { id: string; resourceId: string; eventType: string; recordedAt: string };
export type WorkflowView = { organizationId: string; websiteId: string; domain: string; verifiedAt: string | null;
  platform: string; websiteStatus: string; jobs: AnalysisJob[]; recommendations: PersistedRecommendation[]; events: WorkflowEvent[];
  limits: { jobsPerDay: 20; maxAttempts: 3; externalSpendMinor: '0'; liveExecution: false } };
