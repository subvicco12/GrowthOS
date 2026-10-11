import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeWebsiteBudget } from '../admin-budget-summary';
import { defaultContentPolicies } from '../production-policy';
import { registerWebsite } from '../website-registry';

test('budget summary filters foreign organizations and sites', () => {
  const site = registerWebsite({ organizationId: 'org-a', domain: 'example.com', platform: 'nextjs', timezone: 'UTC' }, 'site-a', 'now');
  const own = { ...defaultContentPolicies('site-a', 'org-a')[0], enabled: true, weeklyLimit: 3, monthlyBudgetMinor: 500 };
  const foreign = { ...defaultContentPolicies('site-b', 'org-b')[0], enabled: true, weeklyLimit: 900, monthlyBudgetMinor: 90000 };
  const result = summarizeWebsiteBudget(site, [own, foreign], 'org-a');
  assert.equal(result.weeklyUnits, 3);
  assert.equal(result.configuredMonthlyMinor, 500);
  assert.equal(result.enabledContentTypes, 1);
  assert.throws(() => summarizeWebsiteBudget(site, [own], 'org-b'), /WEBSITE_ACCESS_DENIED/);
});
