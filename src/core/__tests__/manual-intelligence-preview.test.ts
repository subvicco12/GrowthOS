import test from 'node:test';
import assert from 'node:assert/strict';
import { manualIntelligencePreview, previewInput } from '../manual-intelligence-preview';

const websiteId = '00000000-0000-4000-8000-000000000001';
const page = { url: 'https://example.test/pricing', status: 200, indexable: true,
  title: 'Pricing', h1Count: 1, wordCount: 100, internalLinks: 1 };

test('manual scoped observations reuse SEO and feature rules without claiming a persisted audit', () => {
  const input = previewInput.parse({ websiteId, pages: [page] });
  const result = manualIntelligencePreview(input, 'example.test');
  assert.equal(result.evidence, 'UNVERIFIED_MANUAL_INPUT');
  assert.ok(result.seoFindings.some(f => f.key === 'thin-content'));
  assert.ok(result.featureCandidates.some(f => f.category === 'commerce'));
});

test('refuses off-site, insecure, credential-bearing, alternate-port, and off-site canonical evidence', () => {
  for (const url of ['https://other.test/', 'http://example.test/', 'https://example.test:8443/',
    'https://user@example.test/', 'https://example.test.evil.test/']) {
    assert.throws(() => manualIntelligencePreview({ websiteId, pages: [{ ...page, url }] }, 'example.test'), /EVIDENCE_SCOPE_MISMATCH/);
  }
  assert.throws(() => manualIntelligencePreview({ websiteId, pages: [{ ...page, canonical: 'https://other.test/' }] }, 'example.test'), /EVIDENCE_SCOPE_MISMATCH/);
});

test('bounds and validates the preview input, rejecting extra caller-supplied claims', () => {
  assert.equal(previewInput.safeParse({ websiteId, pages: Array(21).fill(page) }).success, false);
  assert.equal(previewInput.safeParse({ websiteId, pages: [{ ...page, verified: true }] }).success, false);
  assert.equal(previewInput.safeParse({ websiteId, pages: [{ ...page, wordCount: -1 }] }).success, false);
});
