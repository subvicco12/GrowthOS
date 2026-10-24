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
export const previewInput = z.object({ websiteId: z.string().uuid(), pages: z.array(page).min(1).max(20) }).strict();
export type PreviewInput = z.infer<typeof previewInput>;

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
  return {
    evidence: 'UNVERIFIED_MANUAL_INPUT' as const,
    seoFindings: inspectSeoPages(input.pages),
    featureCandidates: discoverFeatureCandidates(input.pages.map(p => ({ url: p.url, title: p.title, metaDescription: p.description, httpStatus: p.status })))
  };
}
