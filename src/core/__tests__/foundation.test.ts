import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { hasMinimumRole } from '../authorization';
import { changeFeatureControl } from '../control-plane';
import { growthSites, growthWorkspaces } from '../portfolio';
import { loadPortfolio } from '../site-registry';
import { DatabaseSiteRegistryRepository } from '../site-registry-db';
import { connectorEnvelopeSchema } from '../connector';
import { decideFeatureAccess, decideOnEntitlementFailure } from '../feature-gates';
import { chooseAiModel } from '../ai-router';
import { authenticateConnector, canonicalConnectorPayload, verifyConnectorSignature, type NonceStore } from '../connector-security';
import { createHmac } from 'node:crypto';
import type { Entitlement } from '../types';
import { recordFeatureChange, type AuditSink } from '../audit';
import { JobRunner, PermanentJobError, retryDelayMs, sanitizeJobError } from '../jobs';

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

test('feature-control service denies cross-site and underprivileged mutations', async () => {
  const repository={get:async()=>({mode:'on'}),set:async()=>({mode:'off'})};
  const audit:AuditSink={append:async()=>{}};
  await assert.rejects(()=>changeFeatureControl({actorId:'user',siteId:'site-a',role:'operator'},{siteId:'site-a',featureKey:'export',mode:'off',reason:'test'},repository,audit),/FORBIDDEN/);
  await assert.rejects(()=>changeFeatureControl({actorId:'user',siteId:'site-a',role:'admin'},{siteId:'site-b',featureKey:'export',mode:'off',reason:'test'},repository,audit),/CROSS_SITE_ACCESS_DENIED/);
});

test('authorized feature-control service writes then audits', async () => {
  const sequence:string[]=[];
  const repository={
    get:async()=>{sequence.push('read');return {mode:'on'};},
    set:async()=>{sequence.push('write');return {mode:'off'};},
  };
  const audit:AuditSink={append:async()=>{sequence.push('audit');}};
  const result=await changeFeatureControl({actorId:'owner',siteId:'site-a',role:'owner'},{siteId:'site-a',featureKey:'export',mode:'off',reason:'Emergency disable'},repository,audit);
  assert.deepEqual(result,{mode:'off'});
  assert.deepEqual(sequence,['read','write','audit']);
});

test('portfolio registry contains six unique production domains and final workspaces', () => {
  assert.equal(growthSites.length,6);
  assert.equal(new Set(growthSites.map(site=>site.domain)).size,6);
  assert.equal(growthWorkspaces.length,12);
  assert.equal(new Set(growthWorkspaces.map(workspace=>workspace.key)).size,12);
  assert.ok(growthWorkspaces.some(workspace=>workspace.key==='approvals'));
  assert.ok(growthWorkspaces.some(workspace=>workspace.key==='engineering'));
});

test('site registry prefers valid database rows and falls back safely', async () => {
  const dbSites=[{name:'Example',domain:'example.com',status:'connected' as const}];
  assert.deepEqual(await loadPortfolio({list:async()=>dbSites},growthSites),{sites:dbSites,source:'database'});
  const empty=await loadPortfolio({list:async()=>[]},growthSites);
  assert.equal(empty.source,'fallback');
  assert.equal(empty.sites.length,6);
  const failed=await loadPortfolio({list:async()=>{throw new Error('DB_DOWN');}},growthSites);
  assert.equal(failed.source,'fallback');
});

test('site registry rejects duplicate database domains and uses fallback', async () => {
  const duplicate=[
    {name:'A',domain:'same.com',status:'connected' as const},
    {name:'B',domain:'SAME.COM',status:'connected' as const},
  ];
  const loaded=await loadPortfolio({list:async()=>duplicate},growthSites);
  assert.equal(loaded.source,'fallback');
  assert.equal(loaded.sites.length,6);
});

test('database registry adapter normalizes site records', async () => {
  const repository=new DatabaseSiteRegistryRepository({listSites:async()=>[
    {name:' Example ',domain:'EXAMPLE.COM ',status:'active'},
    {name:'Paused',domain:'paused.com',status:'paused'},
    {name:'Maintenance',domain:'maintenance.com',status:'maintenance'},
    {name:'Offline',domain:'offline.com',status:'disconnected'},
  ]});
  const sites=await repository.list();
  assert.deepEqual(sites.map(site=>site.status),['connected','disabled','degraded','ready_to_connect']);
  assert.equal(sites[0].name,'Example');
  assert.equal(sites[0].domain,'example.com');
});

test('feature gate fails closed when finite quota usage or partial rollout bucket is missing', () => {
  const e={siteId:'s',featureKey:'f',mode:'on' as const,freeAccess:true,proAccess:true,businessAccess:true,quotaFree:5,rolloutPercent:50,emergencyKill:false,failSafe:'deny' as const,updatedAt:new Date().toISOString()};
  assert.equal(decideFeatureAccess({role:'viewer',requiredRole:'viewer',siteStatus:'active',plan:'free',entitlement:e,rolloutBucket:1}).reason,'USAGE_REQUIRED');
  assert.equal(decideFeatureAccess({role:'viewer',requiredRole:'viewer',siteStatus:'active',plan:'free',entitlement:e,usage:0}).reason,'ROLLOUT_BUCKET_REQUIRED');
});

test('maintenance read-only fallback is honored by central feature gate', () => {
  const e={siteId:'s',featureKey:'f',mode:'maintenance' as const,freeAccess:true,proAccess:true,businessAccess:true,rolloutPercent:100,emergencyKill:false,failSafe:'allow_read_only' as const,updatedAt:new Date().toISOString()};
  assert.equal(decideFeatureAccess({role:'viewer',requiredRole:'viewer',siteStatus:'active',plan:'free',entitlement:e,readOnlyRequest:true}).allowed,true);
});

test('connector signature verifier rejects malformed non-hex input without throwing', () => {
  assert.equal(verifyConnectorSignature('payload','😀'.repeat(32),'secret'),false);
  assert.equal(verifyConnectorSignature('payload','z'.repeat(64),'secret'),false);
});

test('connector envelope rejects oversized identifiers, malformed signatures and unknown fields', () => {
  const base={siteId:'00000000-0000-4000-8000-000000000000',timestamp:new Date().toISOString(),nonce:'n'.repeat(16),requestId:'request1',signature:'a'.repeat(64)};
  assert.equal(connectorEnvelopeSchema.safeParse({...base,nonce:'n'.repeat(129)}).success,false);
  assert.equal(connectorEnvelopeSchema.safeParse({...base,signature:'z'.repeat(64)}).success,false);
  assert.equal(connectorEnvelopeSchema.safeParse({...base,unexpected:true}).success,false);
});

test('job retry policy caps backoff and permanent failures never retry', async () => {
  assert.equal(retryDelayMs(0),60_000);
  assert.equal(retryDelayMs(20),30*60_000);
  const calls:any[]=[];
  const store={claim:async()=>({id:'j',siteId:'s',type:'x',status:'running' as const,payload:{},attempts:0,maxAttempts:3,runAfter:new Date().toISOString()}),succeed:async()=>{},fail:async(...args:any[])=>{calls.push(args)}};
  await new JobRunner(store,{x:async()=>{throw new PermanentJobError('bad input')}}).runOne('w');
  assert.equal(calls[0][2],undefined);
});

test('job error persistence redacts common credential material', () => {
  const message=sanitizeJobError(new Error('token=abc123 password:secret api_key=xyz'));
  assert.equal(message.includes('abc123'),false);
  assert.equal(message.includes('secret'),false);
  assert.equal(message.includes('xyz'),false);
});
