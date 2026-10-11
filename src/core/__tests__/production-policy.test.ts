import test from 'node:test';
import assert from 'node:assert/strict';
import { CONTENT_TYPES, defaultContentPolicies, validateContentPolicy, canQueueProduction } from '../production-policy';

test('every new website starts with zero AI production and no auto publishing', () => {
  const policies = defaultContentPolicies('website-1', 'organization-1');
  assert.equal(policies.length, CONTENT_TYPES.length);
  for (const policy of policies) {
    assert.equal(policy.enabled, false);
    assert.equal(policy.autoPublish, false);
    assert.equal(policy.weeklyLimit, 0);
    assert.equal(policy.monthlyBudgetMinor, 0);
    assert.equal(canQueueProduction(policy), false);
  }
});
test('policy rejects invalid amounts and unsafe auto publishing', () => {
  const policy = defaultContentPolicies('website-1', 'organization-1')[0];
  assert.throws(() => validateContentPolicy({ ...policy, weeklyLimit: -1 }), /INVALID_CONTENT_POLICY/);
  assert.throws(() => validateContentPolicy({ ...policy, monthlyBudgetMinor: 1.5 }), /INVALID_CONTENT_POLICY/);
  assert.throws(() => validateContentPolicy({ ...policy, autoPublish: true }), /AUTOPUBLISH_REQUIRES_ENABLED_POLICY/);
  assert.equal(canQueueProduction({ ...policy, enabled: true, weeklyLimit: 2, monthlyBudgetMinor: 100, maximumJobCostMinor: 20 }), true);
});
