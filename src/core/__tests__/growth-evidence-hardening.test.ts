import test from 'node:test';
import assert from 'node:assert/strict';
import { comparePackages, validateCompetitor, type CompetitorProfile } from '../competitive-intelligence';
import { findFunnelSignals } from '../cro-intelligence';
import { buildNextBestActions, rankGrowthSignal } from '../growth-intelligence';

const competitor: CompetitorProfile = { name: 'Synthetic', domain: 'example.invalid', similarity: .8,
  evidence: ['https://example.invalid/pricing'], inventory: { product: 'Synthetic', capturedAt: '2026-10-18T00:00:00Z',
    evidenceUrl: 'https://example.invalid/pricing', features: [{ key: 'teams', name: 'Teams', plans: { free: false, pro: false, business: true } }] } };

test('duplicate feature rows cannot inflate competitor support', () => {
  const results = comparePackages({ product: 'Ours', capturedAt: competitor.inventory.capturedAt, features: [] },
    [{ ...competitor, inventory: { ...competitor.inventory, features: [...competitor.inventory.features, ...competitor.inventory.features] } }]);
  assert.equal(results[0].competitors, 1);
  assert.equal(results[0].opportunity, 'business_upgrade');
  assert.deepEqual(validateCompetitor({ ...competitor, inventory: { ...competitor.inventory, capturedAt: 'invalid' } }), ['PACKAGE_CAPTURE_TIME_REQUIRED']);
});

test('CRO signals discard invalid denominators and impossible conversions', () => {
  const rows = findFunnelSignals([{ key: 'valid', name: 'Valid', visitors: 100, conversions: 20 },
    { key: 'bad', name: 'Bad', visitors: 100, conversions: 101 },
    { key: 'negative', name: 'Negative', visitors: 100, conversions: -1 },
    { key: 'fraction', name: 'Fraction', visitors: 100.2, conversions: 4 }]);
  assert.deepEqual(rows.map(x => x.step), ['valid']);
});

test('next-best actions require evidence and reject non-finite scores', () => {
  const base = { id: 'one', siteId: 'site-a', category: 'seo' as const, title: 'Synthetic finding', description: '',
    evidence: [{ source: 'synthetic-crawl', observedAt: '2026-10-18T00:00:00Z' }], impact: 4, confidence: 4,
    effort: 2, recurringCostUsd: 0, risk: 1, successMetric: 'Synthetic test metric' };
  const scored = rankGrowthSignal(base);
  assert.equal(buildNextBestActions([scored, { ...scored, id: 'no-evidence', evidence: [] }]).length, 1);
  assert.throws(() => rankGrowthSignal({ ...base, impact: Number.NaN }), /INVALID_GROWTH_SCORE/);
});
