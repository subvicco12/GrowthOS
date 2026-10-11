import test from 'node:test';
import assert from 'node:assert/strict';
import { registerWebsite, assertWebsiteScope, canActivateWebsite, NEW_WEBSITE_DEFAULTS } from '../website-registry';
import { evaluateProductionBudget, authorizeProduction, type ProductionRequest, type ProductionPolicy } from '../ai-budget-engine';

test('new websites default to zero spending, no publishing and draft status', () => {
  const site = registerWebsite({ organizationId: 'org-a', domain: 'Example.com', platform: 'nextjs', timezone: 'Asia/Kolkata' }, 'site-7', '2026-10-11T00:00:00Z');
  assert.equal(site.domain, 'example.com');
  assert.equal(site.status, 'draft');
  assert.equal(canActivateWebsite(site, 'org-a'), false);
  assert.deepEqual(NEW_WEBSITE_DEFAULTS, { automationEnabled: false, autoPublishEnabled: false, weeklyProductionLimit: 0, monthlyBudgetMinor: 0 });
  assert.throws(() => assertWebsiteScope(site, 'org-b'), /WEBSITE_ACCESS_DENIED/);
  assert.throws(() => registerWebsite({ organizationId: 'org-a', domain: 'example.com/unsafe', platform: 'static', timezone: 'UTC' }, 's', 'now'), /INVALID_DOMAIN/);
});
const request: ProductionRequest = { organizationId: 'org-a', websiteId: 'site-7', contentType: 'youtube_short', idempotencyKey: 'unique-1', estimatedCostMinor: 90, maximumJobCostMinor: 100, requestedUnits: 1 };
const policy: ProductionPolicy = { websiteActive: true, automationEnabled: true, globalPaused: false, connectorReady: true, weeklyLimit: 2, weeklyUsedAndReserved: 1, websiteMonthlyLimitMinor: 100, websiteSpentAndReservedMinor: 10, organizationMonthlyLimitMinor: 200, organizationSpentAndReservedMinor: 100 };
test('budget checks enforce weekly, site and organization caps', () => {
  assert.equal(evaluateProductionBudget(request, policy).code, 'APPROVED');
  assert.equal(evaluateProductionBudget(request, { ...policy, weeklyUsedAndReserved: 2 }).code, 'WEEKLY_QUOTA_EXCEEDED');
  assert.equal(evaluateProductionBudget(request, { ...policy, websiteSpentAndReservedMinor: 11 }).code, 'WEBSITE_BUDGET_EXCEEDED');
  assert.equal(evaluateProductionBudget(request, { ...policy, organizationSpentAndReservedMinor: 111 }).code, 'ORGANIZATION_BUDGET_EXCEEDED');
  assert.equal(evaluateProductionBudget(request, { ...policy, globalPaused: true }).code, 'GLOBAL_PAUSE');
  assert.equal(evaluateProductionBudget(request, { ...policy, automationEnabled: false }).code, 'DISABLED');
});
test('authorization rejects malformed requests before reaching store', async () => {
  let calls = 0;
  const store = { reserveAtomically: async () => { calls++; return { decision: { allowed: true, code: 'APPROVED' as const } }; }, reconcileAtomically: async () => {}, cancelAtomically: async () => {} };
  assert.equal((await authorizeProduction({ ...request, estimatedCostMinor: -1 }, store)).decision.code, 'INVALID_REQUEST');
  assert.equal(calls, 0);
  assert.equal((await authorizeProduction(request, store)).decision.code, 'APPROVED');
  assert.equal(calls, 1);
});
