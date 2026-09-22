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
  await assert.rejects(()=>authenticateConnector(envelope,'{}','s'.repeat(32),nonces),/STALE_CONNECTOR_REQUEST/);
  assert.equal(consumed,false);
});

test('connector nonce store blocks replay after valid signature', async () => {
  const seen=new Set<string>();
  const nonces:NonceStore={consume:async(siteId,nonce)=>{const key=`${siteId}:${nonce}`;if(seen.has(key))return false;seen.add(key);return true;}};
  const base={siteId:'11111111-1111-4111-8111-111111111111',timestamp:new Date().toISOString(),nonce:'nonce-replay-123456',requestId:'22222222-2222-4222-8222-222222222222'};
  const body='{}';
  const signature=createHmac('sha256','s'.repeat(32)).update(canonicalConnectorPayload(base,body)).digest('hex');
  const envelope={...base,signature};
  await authenticateConnector(envelope,body,'s'.repeat(32),nonces);
  await assert.rejects(()=>authenticateConnector(envelope,body,'s'.repeat(32),nonces),/CONNECTOR_REPLAY_DETECTED/);
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
  assert.ok(delay>=59000&&delay<=61000);
});

test('feature changes require a reason and redact sensitive before/after values', async () => {
  const events:unknown[]=[];
  const sink:AuditSink={append:async event=>{events.push(event);}};
  await assert.rejects(()=>recordFeatureChange(sink,{siteId:'site',featureKey:'export',reason:'   ',before:{mode:'on'},after:{mode:'off'}}),/FEATURE_CHANGE_REASON_REQUIRED/);
  await recordFeatureChange(sink,{actorId:'actor',siteId:'site',featureKey:'export',reason:'Emergency disable',before:{mode:'on',apiKey:'secret-value'},after:{mode:'off',token:'secret-token'}});
  const event=events[0] as {action:string;resourceId:string;reason?:string;before:Record<string,unknown>;after:Record<string,unknown>};
  assert.equal(event.action,'feature_control.changed');
  assert.equal(event.resourceId,'export');
  assert.equal(event.reason,'Emergency disable');
  assert.equal(event.before.apiKey,'[REDACTED]');
  assert.equal(event.after.token,'[REDACTED]');
  assert.equal(event.after.reason,'Emergency disable');
});

test('feature-control service denies cross-site and underprivileged mutations', async () => {
  const repository={get:async()=>({mode:'on'}),set:async()=>({mode:'off'}),transaction:async(operation:any)=>operation({get:async()=>({mode:'on'}),set:async()=>({mode:'off'}),appendAudit:async()=>{}})};
  await assert.rejects(()=>changeFeatureControl({actorId:'user',siteId:'site-a',role:'operator'},{siteId:'site-a',featureKey:'export',mode:'off',reason:'test'},repository),/FORBIDDEN/);
  await assert.rejects(()=>changeFeatureControl({actorId:'user',siteId:'site-a',role:'admin'},{siteId:'site-b',featureKey:'export',mode:'off',reason:'test'},repository),/CROSS_SITE_ACCESS_DENIED/);
});

test('authorized feature-control mutation and audit share one transaction', async () => {
  const sequence:string[]=[];
  const repository={
    get:async()=>({mode:'on'}),set:async()=>({mode:'off'}),
    transaction:async(operation:any)=>{sequence.push('begin');const result=await operation({
      get:async()=>{sequence.push('read');return {mode:'on'};},
      set:async()=>{sequence.push('write');return {mode:'off'};},
      appendAudit:async()=>{sequence.push('audit');},
    });sequence.push('commit');return result;},
  };
  const result=await changeFeatureControl({actorId:'owner',siteId:'site-a',role:'owner'},{siteId:'site-a',featureKey:'export',mode:'off',reason:'Emergency disable'},repository);
  assert.deepEqual(result,{mode:'off'});
  assert.deepEqual(sequence,['begin','read','write','audit','commit']);
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
  const store={claim:async()=>({id:'j',siteId:'s',type:'x',status:'running' as const,payload:{},idempotencyKey:'job-j',attempts:0,maxAttempts:3,runAfter:new Date().toISOString(),createdAt:new Date().toISOString()}),succeed:async()=>{},fail:async(...args:any[])=>{calls.push(args)}};
  await new JobRunner(store,{x:async()=>{throw new PermanentJobError('bad input')}}).runOne('w');
  assert.equal(calls[0][2],undefined);
});

test('job error persistence redacts common credential material', () => {
  const message=sanitizeJobError(new Error('token=abc123 password:secret api_key=xyz'));
  assert.equal(message.includes('abc123'),false);
  assert.equal(message.includes('secret'),false);
  assert.equal(message.includes('xyz'),false);
});

test('feature beta mode fails closed without explicit eligibility',()=>{
  const beta={...entitlement,mode:'beta' as const};
  assert.equal(decideFeatureAccess({role:'viewer',requiredRole:'viewer',siteStatus:'active',plan:'pro',entitlement:beta,usage:0,rolloutBucket:0}).reason,'BETA_NOT_ELIGIBLE');
  assert.equal(decideFeatureAccess({role:'viewer',requiredRole:'viewer',siteStatus:'active',plan:'pro',entitlement:beta,usage:0,rolloutBucket:0,betaEligible:true}).allowed,true);
  assert.equal(decideFeatureAccess({role:'admin',requiredRole:'viewer',siteStatus:'active',plan:'pro',entitlement:beta,usage:0,rolloutBucket:0}).allowed,true);
});

test('job runner times out work and exposes cancellation signal', async()=>{
  let sawAbort=false; let failure='';
  const store={claim:async()=>({id:'job-timeout',type:'slow',status:'running' as const,idempotencyKey:'idem-timeout',attempts:0,maxAttempts:1,createdAt:new Date(0).toISOString()}),succeed:async()=>{},fail:async(_id:string,error:string)=>{failure=error;}};
  const runner=new JobRunner(store,{slow:async(_job,signal)=>new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>{sawAbort=true;reject(signal.reason);},{once:true}))},{timeoutMs:10});
  assert.equal(await runner.runOne('worker-1'),'failed');
  assert.equal(sawAbort,true); assert.match(failure,/JOB_TIMEOUT/);
});

test('job runner heartbeats renewable leases during work', async()=>{
  let extensions=0;
  const store={claim:async()=>({id:'job-heartbeat',type:'work',status:'running' as const,idempotencyKey:'idem-heartbeat',attempts:0,maxAttempts:2,createdAt:new Date(0).toISOString()}),succeed:async()=>{},fail:async()=>{},extendLease:async()=>{extensions++;return true;}};
  const runner=new JobRunner(store,{work:async()=>{await new Promise(resolve=>setTimeout(resolve,25));return 'ok';}},{leaseSeconds:1,heartbeatMs:5,timeoutMs:100});
  assert.equal(await runner.runOne('worker-1'),'succeeded'); assert.ok(extensions>=1);
});

test('job runner binds completion to claiming worker id', async()=>{
  let succeededBy=''; let failedBy='';
  const successStore={claim:async()=>({id:'job-owner',type:'ok',status:'running' as const,idempotencyKey:'idem-owner',attempts:0,maxAttempts:2,createdAt:new Date(0).toISOString()}),succeed:async(_id:string,_result:unknown,workerId?:string)=>{succeededBy=workerId??'';},fail:async()=>{}};
  assert.equal(await new JobRunner(successStore,{ok:async()=>true}).runOne('worker-owner'),'succeeded'); assert.equal(succeededBy,'worker-owner');
  const failStore={claim:async()=>({id:'job-owner-fail',type:'bad',status:'running' as const,idempotencyKey:'idem-owner-fail',attempts:1,maxAttempts:2,createdAt:new Date(0).toISOString()}),succeed:async()=>{},fail:async(_id:string,_error:string,_retry?:Date,workerId?:string)=>{failedBy=workerId??'';}};
  assert.equal(await new JobRunner(failStore,{bad:async()=>{throw new PermanentJobError('bad');}}).runOne('worker-fail'),'failed'); assert.equal(failedBy,'worker-fail');
});

test('job runner aborts handler when lease heartbeat loses ownership', async()=>{
  let aborted=false; let failure='';
  const store={claim:async()=>({id:'job-lost',type:'work',status:'running' as const,idempotencyKey:'idem-lost',attempts:0,maxAttempts:2,createdAt:new Date(0).toISOString()}),succeed:async()=>{throw new Error('SHOULD_NOT_SUCCEED');},fail:async(_id:string,error:string)=>{failure=error;},extendLease:async()=>false};
  const runner=new JobRunner(store,{work:async(_job,signal)=>new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>{aborted=true;reject(signal.reason);},{once:true}))},{leaseSeconds:1,heartbeatMs:5,timeoutMs:100});
  assert.equal(await runner.runOne('worker-lost'),'failed'); assert.equal(aborted,true); assert.match(failure,/JOB_LEASE_LOST/);
});

test('connector authentication rejects weak secrets oversized bodies and future timestamps before nonce use', async()=>{
  let consumed=0; const nonces={consume:async()=>{consumed++;return true;}};
  const siteId='00000000-0000-4000-8000-000000000001'; const secret='s'.repeat(32); const body='{}';
  const future=new Date(Date.now()+60_000).toISOString(); const base={siteId,timestamp:future,nonce:'nonce-1234567890123456',requestId:'request-12345678'};
  const signature=createHmac('sha256',secret).update(canonicalConnectorPayload(base,body)).digest('hex');
  await assert.rejects(()=>authenticateConnector({...base,signature},body,secret,nonces),/FUTURE_CONNECTOR_REQUEST/);
  await assert.rejects(()=>authenticateConnector({...base,timestamp:new Date().toISOString(),signature},body,'short',nonces),/INVALID_CONNECTOR_SECRET/);
  await assert.rejects(()=>authenticateConnector({...base,timestamp:new Date().toISOString(),signature},'x'.repeat(1_048_577),secret,nonces),/CONNECTOR_BODY_TOO_LARGE/);
  assert.equal(consumed,0);
});

test('transactional feature audit redacts sensitive values while preserving reason', async()=>{
  let event:any;
  const repo={get:async()=>({apiKey:'before-secret'}),set:async()=>({token:'after-secret',mode:'off'}),transaction:async(operation:any)=>operation({get:async()=>({apiKey:'before-secret'}),set:async()=>({token:'after-secret',mode:'off'}),appendAudit:async(e:any)=>{event=e;}})};
  const context={actorId:'11111111-1111-4111-8111-111111111111',siteId:'22222222-2222-4222-8222-222222222222',role:'owner' as const};
  await changeFeatureControl(context,{siteId:context.siteId,featureKey:'exports',mode:'off',reason:'security response'},repo);
  assert.equal(event.before.apiKey,'[REDACTED]'); assert.equal(event.after.token,'[REDACTED]'); assert.equal(event.reason,'security response'); assert.equal(event.after.reason,'security response');
});

test('website discovery normalizes evidence and QA fails closed on missing inventory', async()=>{
  const {buildWebsiteSnapshot,validateSnapshot,summarizeQa}=await import('../discovery');
  const snapshot=buildWebsiteSnapshot({siteId:'site-1',url:'http://example.com',capturedAt:new Date(0).toISOString(),routes:[' /pricing ','/pricing',' /tools '],featureNames:[]});
  assert.deepEqual(snapshot.routes,['/pricing','/tools']);
  const findings=validateSnapshot(snapshot); assert.equal(findings.some((f:any)=>f.id==='https-required'),true); assert.equal(findings.some((f:any)=>f.id==='no-features'),true);
  const summary=summarizeQa(findings); assert.equal(summary.total,2); assert.equal(summary.critical,1); assert.equal(summary.medium,1); assert.equal(summary.score,64);
});

test('website discovery deduplicates feature names and technology evidence', async()=>{
  const {buildWebsiteSnapshot}=await import('../discovery');
  const snapshot=buildWebsiteSnapshot({siteId:'site-1',url:'https://example.com',capturedAt:new Date(0).toISOString(),featureNames:['QR Generator',' QR  Generator ','Analytics'],technologies:['React','React',' PostgreSQL ']});
  assert.equal(snapshot.features.length,2); assert.deepEqual(snapshot.technologies,['React','PostgreSQL']);
});

test('packaging intelligence finds tier gaps only from sufficiently similar competitors', async()=>{
 const {comparePackages,validateCompetitor}=await import('../competitive-intelligence');
 const ours={product:'ours',capturedAt:'2026-01-01T00:00:00Z',features:[{key:'analytics',name:'Analytics',plans:{free:false,pro:true,business:true}}]};
 const competitor=(name:string,similarity:number)=>({name,domain:name+'.com',similarity,evidence:['pricing page'],inventory:{product:name,capturedAt:'2026-01-01T00:00:00Z',evidenceUrl:'https://'+name+'.com/pricing',features:[{key:'bulk-export',name:'Bulk Export',plans:{free:false,pro:true,business:true}},{key:'analytics',name:'Analytics',plans:{free:true,pro:true,business:true}}]}});
 const gaps=comparePackages(ours as any,[competitor('close',.9) as any,competitor('irrelevant',.2) as any]);
 assert.equal(gaps.find((g:any)=>g.featureKey==='bulk-export')?.competitors,1); assert.equal(gaps.find((g:any)=>g.featureKey==='bulk-export')?.opportunity,'business_upgrade'); assert.equal(gaps.find((g:any)=>g.featureKey==='analytics')?.opportunity,'consider_free');
 assert.deepEqual(validateCompetitor(competitor('close',.9) as any),[]);
});

test('competitor intelligence requires package evidence and valid similarity', async()=>{
 const {validateCompetitor}=await import('../competitive-intelligence');
 const issues=validateCompetitor({name:'x',domain:'x.test',similarity:2,evidence:[],inventory:{product:'x',capturedAt:'2026-01-01T00:00:00Z',features:[]}} as any);
 assert.deepEqual(issues,['INVALID_SIMILARITY','EVIDENCE_REQUIRED','PACKAGE_EVIDENCE_URL_REQUIRED']);
});

test('opportunity ranking converts package gaps into approval-gated recommendations', async()=>{
 const {packageGapsToOpportunities,rankOpportunity}=await import('../opportunities');
 const gaps=[{featureKey:'bulk',featureName:'Bulk Export',competitors:3,ours:{free:false,pro:false,business:false},competitorPlans:['pro','business'],opportunity:'business_upgrade'}];
 const rows=packageGapsToOpportunities('site-1',gaps as any); assert.equal(rows.length,1); assert.equal(rows[0].approvalClass,'amber'); assert.equal(rows[0].category,'packaging'); assert.equal(rows[0].evidence.length,2); assert.ok(rows[0].score>0);
 const revenue=rankOpportunity({siteId:'site-1',category:'revenue',title:'Change pricing',evidence:['approved research'],impact:5,confidence:5,effort:1,recurringCostUsd:0,risk:3}); assert.equal(revenue.approvalClass,'red');
});

test('opportunity ranking clamps invalid scoring inputs and never creates negative cost', async()=>{
 const {rankOpportunity}=await import('../opportunities'); const row=rankOpportunity({siteId:'s',category:'qa',title:'x',evidence:[],impact:99,confidence:0,effort:-2,recurringCostUsd:-50,risk:99});
 assert.equal(row.impact,5); assert.equal(row.confidence,1); assert.equal(row.effort,1); assert.equal(row.risk,5); assert.equal(row.recurringCostUsd,0); assert.equal(row.approvalClass,'red');
});

test('recommendation execution enforces green amber and red approval policy', async()=>{
 const {executionFor}=await import('../recommendations'); const base={id:'r1',siteId:'s1',category:'qa',title:'Run QA',evidence:['x'],impact:3,confidence:4,effort:1,recurringCostUsd:0,risk:1,score:6,createdAt:'2026-01-01T00:00:00Z'};
 assert.equal(executionFor({...base,approvalClass:'green',status:'proposed'} as any).jobType,'recommendation.qa');
 assert.throws(()=>executionFor({...base,approvalClass:'amber',status:'proposed'} as any),/RECOMMENDATION_APPROVAL_REQUIRED/);
 assert.throws(()=>executionFor({...base,approvalClass:'red',status:'proposed'} as any),/RECOMMENDATION_APPROVAL_REQUIRED/);
 assert.equal(executionFor({...base,approvalClass:'red',status:'approved'} as any).payload.approvalClass,'red');
});

test('recommendation lifecycle blocks unsafe or duplicate state transitions', async()=>{
 const {assertApprovalTransition}=await import('../recommendations'); assert.doesNotThrow(()=>assertApprovalTransition('proposed','approved')); assert.doesNotThrow(()=>assertApprovalTransition('approved','implemented')); assert.doesNotThrow(()=>assertApprovalTransition('implemented','verified')); assert.throws(()=>assertApprovalTransition('proposed','implemented'),/INVALID_RECOMMENDATION_TRANSITION/); assert.throws(()=>assertApprovalTransition('verified','approved'),/INVALID_RECOMMENDATION_TRANSITION/);
});

test('job runner retries after started attempts one and two but stops after attempt three', async()=>{
 const {JobRunner}=await import('../jobs'); const retryFlags:boolean[]=[]; let attempt=1;
 const store:any={claim:async()=>({id:'j',type:'x',status:'running',idempotencyKey:'k',attempts:attempt,maxAttempts:3,createdAt:'x'}),succeed:async()=>{},fail:async(_id:string,_err:string,retryAt?:Date)=>{retryFlags.push(Boolean(retryAt));}};
 const runner=new JobRunner(store,{x:async()=>{throw new Error('transient')}}); await runner.runOne('w'); attempt=2; await runner.runOne('w'); attempt=3; await runner.runOne('w'); assert.deepEqual(retryFlags,[true,true,false]);
});

test('approved recommendation dispatch uses a stable idempotency key and bounded attempts', async()=>{
 const {enqueueRecommendation,recommendationJobKey}=await import('../recommendation-jobs'); const calls:any[]=[]; const recommendation:any={id:'rec-1',siteId:'site-1',category:'qa',title:'QA',evidence:['e'],impact:3,confidence:4,effort:1,recurringCostUsd:0,risk:1,score:6,approvalClass:'green',status:'approved',createdAt:'x'}; const executable:any={recommendation,jobType:'recommendation.qa',payload:{recommendationId:'rec-1',siteId:'site-1'}};
 const enqueuer:any={enqueue:async(input:any)=>{calls.push(input);return{id:'job-1',created:calls.length===1}}}; await enqueueRecommendation(enqueuer,executable); await enqueueRecommendation(enqueuer,executable); assert.equal(calls[0].idempotencyKey,recommendationJobKey(executable)); assert.equal(calls[0].idempotencyKey,calls[1].idempotencyKey); assert.equal(calls[0].maxAttempts,3);
});

test('discovery job builds normalized snapshot and QA evidence', async()=>{
 const {createDiscoveryHandler}=await import('../intelligence-jobs'); const handler=createDiscoveryHandler({inspect:async()=>({url:'https://example.com',routes:[' / ',' /pricing ',' /pricing '],featureNames:[' Export ','Export'],technologies:['React',' React ']})}); const result:any=await handler({id:'j',siteId:'s',type:'website.discovery',status:'running',idempotencyKey:'k',attempts:1,maxAttempts:3,createdAt:'x'},new AbortController().signal); assert.deepEqual(result.snapshot.routes,['/','/pricing']); assert.equal(result.snapshot.features.length,1); assert.equal(result.qa.score,100);
});

test('QA job rejects cross-site snapshot and scores missing inventory', async()=>{
 const {createQaHandler}=await import('../intelligence-jobs'); const job:any={id:'j',siteId:'s',type:'website.qa',status:'running',idempotencyKey:'k',attempts:1,maxAttempts:3,createdAt:'x'}; const bad=createQaHandler({load:async()=>({siteId:'other',url:'https://example.com',capturedAt:'x',routes:[],features:[],technologies:[]})}); await assert.rejects(()=>bad(job,new AbortController().signal),/QA_SITE_MISMATCH/); const good=createQaHandler({load:async()=>({siteId:'s',url:'https://example.com',capturedAt:'x',routes:[],features:[],technologies:[]})}); const result:any=await good(job,new AbortController().signal); assert.equal(result.summary.high,1); assert.equal(result.summary.medium,1); assert.equal(result.summary.score,79);
});

test('QA regressions become prioritized opportunities while resolved and unchanged findings are ignored', async()=>{
 const {qaRegressionsToOpportunities}=await import('../regression-opportunities'); const previous:any[]=[{id:'a',category:'content',severity:'low',title:'A',evidence:'old'},{id:'gone',category:'navigation',severity:'high',title:'Gone',evidence:'old'}]; const current:any[]=[{id:'a',category:'content',severity:'high',title:'A',evidence:'new'},{id:'sec',category:'security',severity:'critical',title:'TLS issue',evidence:'tls'}]; const out=qaRegressionsToOpportunities('s',previous,current); assert.equal(out.length,2); assert.ok(out.some(x=>x.title==='Resolve A'&&x.approvalClass==='green')); assert.ok(out.some(x=>x.title==='Resolve TLS issue'&&x.approvalClass==='red')); assert.ok(!out.some(x=>x.title.includes('Gone')));
});

test('package history detects price and tier entitlement changes', async()=>{ const {comparePackageHistory}=await import('../package-history'); const prev:any={product:'x',capturedAt:'a',monthlyPrice:{pro:10},features:[{key:'export',name:'Export',plans:{free:false,pro:true,business:true}}]}; const cur:any={product:'x',capturedAt:'b',monthlyPrice:{pro:12},features:[{key:'export',name:'Export',plans:{free:true,pro:true,business:true}},{key:'api',name:'API',plans:{free:false,pro:false,business:true}}]}; const out=comparePackageHistory(prev,cur); assert.ok(out.some(x=>x.kind==='price_changed'&&x.plan==='pro')); assert.ok(out.some(x=>x.kind==='access_changed'&&x.key==='export'&&x.plan==='free')); assert.ok(out.some(x=>x.kind==='feature_added'&&x.key==='api')); });

test('package gaps produce explicit Free Pro Business upgrade targets', async()=>{ const {packageUpgradeOpportunities}=await import('../upgrade-opportunities'); const gaps:any[]=[{featureKey:'a',featureName:'A',competitors:2,ours:{free:false,pro:false,business:false},competitorPlans:['free'],opportunity:'consider_free'},{featureKey:'b',featureName:'B',competitors:3,ours:{free:false,pro:false,business:true},competitorPlans:['pro'],opportunity:'pro_upgrade'},{featureKey:'c',featureName:'C',competitors:4,ours:{free:false,pro:false,business:false},competitorPlans:['business'],opportunity:'business_upgrade'}]; const out=packageUpgradeOpportunities('s',gaps); assert.deepEqual(new Set(out.map(x=>x.targetPlan)),new Set(['free','pro','business'])); assert.ok(out.every(x=>x.approvalClass==='amber')); });

test('recommendation approval service rolls back when audit persistence fails', async()=>{ const {PostgresRecommendationApprovalService}=await import('../recommendation-approval-service'); const calls:string[]=[]; const db:any={query:async(sql:string)=>{calls.push(sql); if(sql==='begin'||sql==='commit'||sql==='rollback')return{rows:[]}; if(sql.includes('for update'))return{rows:[{id:'r',site_id:'s',status:'proposed',category:'qa',title:'Fix',evidence:['e'],impact:3,confidence:4,effort:2,recurring_cost_usd:0,risk:2,score:2,approval_class:'amber',created_at:'2026-01-01'}]}; if(sql.startsWith('insert into public.audit_events'))throw new Error('AUDIT_FAIL'); return{rows:[{id:'r'}]};}}; await assert.rejects(()=>new PostgresRecommendationApprovalService(db).decide({recommendationId:'r',actorId:'u',decision:'approved',idempotencyKey:'k'}),/AUDIT_FAIL/); assert.equal(calls.at(-1),'rollback'); assert.ok(!calls.includes('commit')); });

test('Postgres job claims expose persisted recommendation payloads', async()=>{ const {PostgresJobStore}=await import('../job-store-postgres'); const db:any={query:async()=>({rows:[{id:'j',site_id:'s',type:'recommendation.qa',status:'running',idempotency_key:'k',attempts:1,max_attempts:3,payload:{recommendationId:'r',approvalClass:'amber'},created_at:'2026-01-01'}]})}; const job=await new PostgresJobStore(db).claim('w',60); assert.equal(job?.payload?.recommendationId,'r'); assert.equal(job?.payload?.approvalClass,'amber'); });

test('malformed intelligence jobs are permanent failures', async()=>{ const {PermanentJobError}=await import('../jobs'); const {createDiscoveryHandler}=await import('../intelligence-jobs'); const {createCompetitorHandler}=await import('../competitor-jobs'); const signal=new AbortController().signal; const job:any={id:'j',type:'website.discovery',status:'running',idempotencyKey:'k',attempts:1,maxAttempts:3,createdAt:'x'}; await assert.rejects(()=>createDiscoveryHandler({inspect:async()=>{throw new Error('should not run')}})(job,signal),(e:any)=>e instanceof PermanentJobError&&e.message==='DISCOVERY_SITE_REQUIRED'); await assert.rejects(()=>createCompetitorHandler({collect:async()=>{throw new Error('should not run')}})(job,signal),(e:any)=>e instanceof PermanentJobError&&e.message==='COMPETITOR_SITE_REQUIRED'); });

test('intelligence history reports route feature technology and QA changes', async()=>{ const {compareSnapshots,compareFindings}=await import('../intelligence-history'); const prev:any={siteId:'s',url:'https://x',capturedAt:'a',routes:['/','/old'],features:[{name:'Old'}],technologies:['React']}; const cur:any={siteId:'s',url:'https://x',capturedAt:'b',routes:['/','/new'],features:[{name:'New'}],technologies:['Next.js']}; const changes=compareSnapshots(prev,cur); assert.deepEqual(new Set(changes.map(x=>x.type)),new Set(['route_added','route_removed','feature_added','feature_removed','technology_added','technology_removed'])); const qa=compareFindings([{id:'a',severity:'low'},{id:'gone',severity:'high'}] as any,[{id:'a',severity:'critical'},{id:'new',severity:'medium'}] as any); assert.ok(qa.some(x=>x.key==='a'&&x.kind==='severity_changed'&&x.before==='low'&&x.after==='critical')); assert.ok(qa.some(x=>x.key==='gone'&&x.kind==='resolved')); assert.ok(qa.some(x=>x.key==='new'&&x.kind==='new')); });

test('competitor handler rejects invalid evidence and produces package opportunities from valid peers', async()=>{ const {createCompetitorHandler}=await import('../competitor-jobs'); const ours:any={product:'ours',currency:'USD',monthlyPrice:{},features:[],evidenceUrl:'https://ours.example/pricing',capturedAt:'x'}; const valid:any={name:'Peer',domain:'peer.example',similarity:.9,evidence:['pricing'],inventory:{product:'peer',currency:'USD',monthlyPrice:{pro:10},features:[{key:'api',name:'API',plans:{free:false,pro:true,business:true}}],evidenceUrl:'https://peer.example/pricing',capturedAt:'x'}}; const invalid:any={...valid,name:'Bad',domain:'bad.example',similarity:2,evidence:[]}; const handler=createCompetitorHandler({collect:async()=>({ours,competitors:[valid,invalid]})}); const out:any=await handler({id:'j',siteId:'s',type:'competitor.refresh',status:'running',idempotencyKey:'k',attempts:1,maxAttempts:3,createdAt:'x'},new AbortController().signal); assert.equal(out.competitorsAccepted,1); assert.equal(out.competitorsRejected,1); assert.equal(out.rejected[0].domain,'bad.example'); assert.ok(out.gaps.some((g:any)=>g.featureKey==='api')); assert.ok(out.opportunities.some((o:any)=>o.category==='packaging')); });

test('recommendation freshness prevents noisy duplicate work', async()=>{ const {decideRecommendationFreshness}=await import('../recommendation-freshness'); const base:any={siteId:'s',category:'qa',title:'Fix X',evidence:['same'],impact:3,confidence:4,effort:2,recurringCostUsd:0,risk:2,score:3,approvalClass:'green'}; const now=new Date('2026-09-22T06:00:00Z'); const fresh={...base,status:'proposed',evidenceCapturedAt:'2026-09-22T05:00:00Z'}; assert.equal(decideRecommendationFreshness(base,fresh,{staleAfterHours:24,suppressDeferred:true},now).action,'skip'); const deferred={...fresh,status:'deferred'}; assert.equal(decideRecommendationFreshness(base,deferred,{staleAfterHours:24,suppressDeferred:true},now).action,'suppress'); const stale={...fresh,evidenceCapturedAt:'2026-09-20T00:00:00Z'}; assert.equal(decideRecommendationFreshness(base,stale,{staleAfterHours:24,suppressDeferred:true},now).action,'refresh'); assert.equal(decideRecommendationFreshness(base,undefined,{staleAfterHours:24,suppressDeferred:true},now).action,'create'); });

test('operational dashboard is bounded and defaults safely to empty state', async()=>{ const {buildOperationalDashboard,emptyOperationalCounts}=await import('../operational-dashboard'); const empty=buildOperationalDashboard(); assert.equal(empty.counts.needsApproval,0); const model=buildOperationalDashboard({counts:{...emptyOperationalCounts(),needsApproval:4},nextBestActions:['1','2','3','4','5','6'],recentActivity:Array.from({length:12},(_,i)=>String(i))}); assert.equal(model.counts.needsApproval,4); assert.equal(model.nextBestActions.length,5); assert.equal(model.recentActivity.length,10); });

test('action center prioritizes next best actions and separates approval inbox', async()=>{ const {buildNextBestActions,buildApprovalInbox}=await import('../action-center'); const items:any[]=[{id:'1',siteId:'s',title:'Low',category:'qa',score:2,approvalClass:'green',status:'proposed',reason:'Low priority'},{id:'2',siteId:'s',title:'Pricing',category:'packaging',score:5,approvalClass:'amber',status:'proposed',evidence:['e'],impact:5,confidence:5,effort:2,risk:2},{id:'3',siteId:'s',title:'Verified',category:'qa',score:9,approvalClass:'green',status:'verified',reason:'Already verified'}]; assert.equal(buildNextBestActions(items,2)[0].id,'2'); assert.equal(buildNextBestActions(items,2).length,2); assert.equal(buildApprovalInbox(items).length,1); assert.equal(buildApprovalInbox(items)[0].id,'2'); });
