import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { hasMinimumRole } from '../authorization';
import { decideFeatureAccess } from '../feature-gates';
import { chooseAiModel } from '../ai-router';
import { verifyConnectorSignature } from '../connector-security';
import { createHmac } from 'node:crypto';

test('role hierarchy denies privilege escalation',()=>{
  assert.equal(hasMinimumRole('viewer','admin'),false);
  assert.equal(hasMinimumRole('owner','admin'),true);
});

test('disabled feature fails closed',()=>{
  assert.deepEqual(decideFeatureAccess({role:'owner',requiredRole:'viewer',siteStatus:'active',featureState:'disabled'}),{allowed:false,reason:'FEATURE_DISABLED'});
});

test('AI router chooses affordable qualified model',()=>{
  const chosen=chooseAiModel('research',[{provider:'a',model:'cheap',estimatedCostUsd:.01,quality:.5},{provider:'b',model:'good',estimatedCostUsd:.04,quality:.9}],{enabled:true,remainingUsd:1,perJobLimitUsd:.1});
  assert.equal(chosen.model,'good');
});

test('connector signature uses timing-safe HMAC verification',()=>{
  const payload='site\ntime\nnonce\nrequest\n{}'; const secret='test-secret';
  const sig=createHmac('sha256',secret).update(payload).digest('hex');
  assert.equal(verifyConnectorSignature(payload,sig,secret),true);
  assert.equal(verifyConnectorSignature(payload,'0'.repeat(64),secret),false);
});
