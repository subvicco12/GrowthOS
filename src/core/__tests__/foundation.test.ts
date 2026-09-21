import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { hasMinimumRole } from '../authorization';
import { decideFeatureAccess, decideOnEntitlementFailure } from '../feature-gates';
import { chooseAiModel } from '../ai-router';
import { verifyConnectorSignature } from '../connector-security';
import { createHmac } from 'node:crypto';
import type { Entitlement } from '../types';

const entitlement: Entitlement = {
  siteId: 'site',
  featureKey: 'export',
  mode: 'on',
  freeAccess: false,
  proAccess: true,
  businessAccess: true,
  quotaFree: 0,
  quotaPro: 10,
  quotaBusiness: null,
  rolloutPercent: 100,
  emergencyKill: false,
  failSafe: 'deny',
  updatedAt: new Date(0).toISOString(),
};

test('role hierarchy denies privilege escalation', () => {
  assert.equal(hasMinimumRole('viewer', 'admin'), false);
  assert.equal(hasMinimumRole('owner', 'admin'), true);
});

test('feature gates enforce mode and emergency kill', () => {
  assert.equal(decideFeatureAccess({ role:'owner', requiredRole:'viewer', siteStatus:'active', plan:'pro', entitlement:{...entitlement, mode:'off'} }).reason, 'FEATURE_OFF');
  assert.equal(decideFeatureAccess({ role:'owner', requiredRole:'viewer', siteStatus:'active', plan:'pro', entitlement:{...entitlement, emergencyKill:true} }).reason, 'EMERGENCY_KILL');
});

test('feature gates enforce plan, quota and rollout', () => {
  assert.equal(decideFeatureAccess({ role:'owner', requiredRole:'viewer', siteStatus:'active', plan:'free', entitlement }).reason, 'PLAN_NOT_ENTITLED');
  assert.equal(decideFeatureAccess({ role:'owner', requiredRole:'viewer', siteStatus:'active', plan:'pro', entitlement, usage:10 }).reason, 'QUOTA_EXCEEDED');
  assert.equal(decideFeatureAccess({ role:'owner', requiredRole:'viewer', siteStatus:'active', plan:'pro', entitlement:{...entitlement, rolloutPercent:25}, rolloutBucket:25 }).reason, 'ROLLOUT_NOT_INCLUDED');
  assert.equal(decideFeatureAccess({ role:'owner', requiredRole:'viewer', siteStatus:'active', plan:'business', entitlement, usage:1000 }).allowed, true);
});

test('entitlement failure denies by default and permits configured read-only fallback', () => {
  assert.deepEqual(decideOnEntitlementFailure('deny', true), {allowed:false, reason:'ENTITLEMENT_UNAVAILABLE'});
  assert.deepEqual(decideOnEntitlementFailure('allow_read_only', true), {allowed:true, reason:'FAIL_SAFE_READ_ONLY'});
  assert.deepEqual(decideOnEntitlementFailure('allow_read_only', false), {allowed:false, reason:'ENTITLEMENT_UNAVAILABLE'});
});

test('AI router chooses affordable qualified model', () => {
  const chosen=chooseAiModel('research',[{provider:'a',model:'cheap',estimatedCostUsd:.01,quality:.5},{provider:'b',model:'good',estimatedCostUsd:.04,quality:.9}],{enabled:true,remainingUsd:1,perJobLimitUsd:.1});
  assert.equal(chosen.model,'good');
});

test('connector signature uses timing-safe HMAC verification', () => {
  const payload='site\ntime\nnonce\nrequest\n{}'; const secret='test-secret';
  const sig=createHmac('sha256',secret).update(payload).digest('hex');
  assert.equal(verifyConnectorSignature(payload,sig,secret),true);
  assert.equal(verifyConnectorSignature(payload,'0'.repeat(64),secret),false);
});
