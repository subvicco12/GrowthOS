import { z } from 'zod';
import { inspectSeoPages } from './seo-intelligence';
import { discoverFeatureCandidates } from './feature-intelligence';

const page = z.object({
  url: z.string().url().max(2048), status: z.number().int().min(100).max(599),
  indexable: z.boolean(), canonical: z.string().url().max(2048).optional(),
  title: z.string().max(300).optional(), description: z.string().max(1000).optional(),
  h1Count: z.number().int().min(0).max(100), wordCount: z.number().int().min(0).max(1000000),
  internalLinks: z.number().int().min(0).max(1000000)
}).strict();
const competitor = z.object({ evidenceUrl: z.string().url().max(2048).refine(value => new URL(value).protocol === 'https:'), featureName: z.string().trim().min(2).max(120),
  plan: z.enum(['free','pro','business']), ourAvailability: z.enum(['present','absent','unknown']) }).strict();
export const previewInput = z.object({ websiteId: z.string().uuid(), pages: z.array(page).min(1).max(20),
  competitors: z.array(competitor).max(5).optional() }).strict();
export type PreviewInput = z.infer<typeof previewInput>;

export type ManualRecommendation = { category: 'seo' | 'content' | 'conversion' | 'feature_review'; title: string; rationale: string; evidenceUrl: string };

function scopedUrl(raw: string, domain: string): boolean {
  const url = new URL(raw);
  return url.protocol === 'https:' && !url.username && !url.password && !url.port &&
    url.hostname.toLowerCase() === domain.toLowerCase();
}

/** Computes a local preview from user-supplied observations. No crawler, persisted evidence or approval. */
export function manualIntelligencePreview(input: PreviewInput, domain: string) {
  if (!input.pages.every(p => scopedUrl(p.url, domain) && (!p.canonical || scopedUrl(p.canonical, domain)))) {
    throw Error('EVIDENCE_SCOPE_MISMATCH');
  }
  if (input.competitors?.some(c => { const url = new URL(c.evidenceUrl);
    return url.protocol !== 'https:' || !!url.username || !!url.password || !!url.port ||
      url.hostname.toLowerCase() === domain.toLowerCase(); })) throw Error('EVIDENCE_SCOPE_MISMATCH');
  const seoFindings = inspectSeoPages(input.pages);
  const featureCandidates = discoverFeatureCandidates(input.pages.map(p => ({ url: p.url, title: p.title, metaDescription: p.description, httpStatus: p.status })));
  const recommendations: ManualRecommendation[] = seoFindings.map(f => ({
    category: f.type === 'content' ? 'content' : f.type === 'internal_link' ? 'conversion' : 'seo',
    title: f.type === 'content' ? 'Review content depth' : f.type === 'internal_link' ? 'Review internal paths' : 'Review ' + f.type.replace('_', ' '),
    rationale: f.evidence, evidenceUrl: f.url
  }));
  for (const feature of featureCandidates) recommendations.push({ category: 'feature_review',
    title: 'Review ' + feature.name, rationale: 'Feature candidate inferred from manually supplied page text; verify availability and plan access before making a product decision.',
    evidenceUrl: feature.evidence[0] ?? input.pages[0].url });
  for (const item of input.competitors ?? []) {
    if (item.ourAvailability === 'present') continue;
    recommendations.push({ category: 'feature_review', title: 'Compare ' + item.featureName + ' for ' + item.plan,
      rationale: item.ourAvailability === 'unknown' ? 'Own availability is unknown. Verify both inventories before deciding.' :
        'Manually reported gap. Verify competitor evidence, rights, feasibility and first-party entitlement before planning.',
      evidenceUrl: item.evidenceUrl });
  }
  return {
    evidence: 'UNVERIFIED_MANUAL_INPUT' as const,
    seoFindings, featureCandidates, recommendations
  };
}
