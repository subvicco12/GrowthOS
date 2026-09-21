import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { hasMinimumRole } from '../authorization';
import { decideFeatureAccess, decideOnEntitlementFailure } from '../feature-gates';
import { chooseAiModel } from '../ai-router';
import { authenticateConnector, canonicalConnectorPayload, verifyConnectorSignature, type NonceStore } from '../connector-security';
import { createHmac } from 'node:crypto';
import type { Entitlement } from '../types';
import { recordFeatureChange, type AuditSink } from '../audit';

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

test('connector rejects stale timestamps before nonce consumption', async () => {
  let consumed=false;
  const nonces:NonceStore={consume:async()=>{consumed=true;return true;}};
  const envelope={siteId:'11111111-1111-4111-8111-111111111111',timestamp:new Date(Date.now()-10*60*1000).toISOString(),nonce:'nonce-stale-123456',requestId:'22222222-2222-4222-8222-222222222222',signature:'0'.repeat(64)};
  await assert.rejects(()=>authenticateConnector(envelope,'{}','secret',nonces),/STALE_CONNECTOR_REQUEST/);
  assert.equal(consumed,false);
});

test('connector nonce store blocks replay after valid signature', async () => {
  const seen=new Set<string>();
  const nonces:NonceStore={consume:async(siteId,nonce)=>{const key=`${siteId}:${nonce}`;if(seen.has(key))return false;seen.add(key);return true;}};
  const base={siteId:'11111111-1111-4111-8111-111111111111',timestamp:new Date().toISOString(),nonce:'nonce-replay-123456',requestId:'22222222-2222-4222-8222-222222222222'};
  const body='{}';
  const signature=createHmac('sha256','secret').update(canonicalConnectorPayload(base,body)).digest('hex');
  const envelope={...base,signature};
  await authenticateConnector(envelope,body,'secret',nonces);
  await assert.rejects(()=>authenticateConnector(envelope,body,'secret',nonces),/CONNECTOR_REPLAY_DETECTED/);
});

test('unknown job types fail closed without executing work', async () => {
  const { JobRunner } = await import('../jobs');
  let failure='';
  const store={
    claim:async()=>({id:'job-1',type:'unknown',status:'queued' as const,idempotencyKey:'idem-1',attempts:0,maxAttempts:3,createdAt:new Date(0).toISOString()}),
    succeed:async()=>{throw new Error('SHOULD_NOT_SUCCEED');},
    fail:async(_id:string,error:string)=>{failure=error;},
  };
  const runner=new JobRunner(store,{});
  assert.equal(await runner.runOne('worker-1'),'failed');
  assert.equal(failure,'UNKNOWN_JOB_TYPE:unknown');
});

test('job retry uses bounded exponential backoff before max attempts', async () => {
  const { JobRunner } = await import('../jobs');
  let retryAt:Date|undefined;
  const before=Date.now();
  const store={
    claim:async()=>({id:'job-2',type:'scan',status:'queued' as const,idempotencyKey:'idem-2',attempts:1,maxAttempts:3,createdAt:new Date(0).toISOString()}),
    succeed:async()=>{},
    fail:async(_id:string,_error:string,retry?:Date)=>{retryAt=retry;},
  };
  const runner=new JobRunner(store,{scan:async()=>{throw new Error('TRANSIENT');}});
  assert.equal(await runner.runOne('worker-1'),'failed');
  assert.ok(retryAt);
  const delay=retryAt!.getTime()-before;
  assert.ok(delay>=119000&&delay<=121000);
});

test('feature changes require a reason and redact sensitive before/after values', async () => {
  const events:unknown[]=[];
  const sink:AuditSink={append:async event=>{events.push(event);}};
  await assert.rejects(()=>recordFeatureChange(sink,{siteId:'site',featureKey:'export',reason:'   ',before:{mode:'on'},after:{mode:'off'}}),/FEATURE_CHANGE_REASON_REQUIRED/);
  await recordFeatureChange(sink,{actorId:'actor',siteId:'site',featureKey:'export',reason:'Emergency disable',before:{mode:'on',apiKey:'secret-value'},after:{mode:'off',token:'secret-token'}});
  const event=events[0] as {action:string;resourceId:string;before:Record<string,unknown>;after:Record<string,unknown>};
  assert.equal(event.action,'feature_control.changed');
  assert.equal(event.resourceId,'export');
  assert.equal(event.before.apiKey,'[REDACTED]');
  assert.equal(event.after.token,'[REDACTED]');
  assert.equal(event.after.reason,'Emergency disable');
});
