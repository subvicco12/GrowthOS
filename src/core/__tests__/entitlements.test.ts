import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { applyEntitlementOverride, decideEntitlement, stableRolloutBucket } from '../entitlements';
import type { Entitlement } from '../types';

const base:Entitlement={siteId:'site-1',featureKey:'export',mode:'on',freeAccess:true,proAccess:true,businessAccess:true,quotaFree:5,quotaPro:50,quotaBusiness:null,rolloutPercent:100,emergencyKill:false,failSafe:'deny',updatedAt:new Date(0).toISOString()};

test('emergency kill switch overrides every tier',()=>{
  assert.equal(decideEntitlement({...base,emergencyKill:true},{plan:'business',isAdmin:true,stableRolloutBucket:0,usage:0}).reason,'KILL_SWITCH');
});

test('tier access is independently enforced',()=>{
  assert.equal(decideEntitlement({...base,freeAccess:false},{plan:'free',isAdmin:false,stableRolloutBucket:0,usage:0}).reason,'PLAN_DENIED');
});

test('quota is enforced and business can be unlimited',()=>{
  assert.equal(decideEntitlement(base,{plan:'free',isAdmin:false,stableRolloutBucket:0,usage:5}).reason,'QUOTA');
  assert.equal(decideEntitlement(base,{plan:'business',isAdmin:false,stableRolloutBucket:0,usage:5000}).allowed,true);
});

test('percentage rollout uses deterministic stable bucket',()=>{
  const first=stableRolloutBucket('account-123',base.siteId,base.featureKey);
  const second=stableRolloutBucket('account-123',base.siteId,base.featureKey);
  const otherFeature=stableRolloutBucket('account-123',base.siteId,'other-feature');
  assert.equal(first,second);
  assert.ok(first>=0&&first<=99);
  assert.ok(otherFeature>=0&&otherFeature<=99);
  assert.equal(decideEntitlement({...base,rolloutPercent:first},{plan:'pro',isAdmin:false,stableRolloutBucket:first,usage:0}).reason,'ROLLOUT');
});

test('maintenance defaults closed and can explicitly fail safe read-only',()=>{
  assert.equal(decideEntitlement({...base,mode:'maintenance'},{plan:'pro',isAdmin:false,stableRolloutBucket:0,usage:0}).allowed,false);
  const decision=decideEntitlement({...base,mode:'maintenance',failSafe:'allow_read_only',customerMessage:'Temporarily read-only'},{plan:'pro',isAdmin:false,stableRolloutBucket:0,usage:0});
  assert.equal(decision.allowed,true);
  assert.equal(decision.readOnly,true);
  assert.equal(decision.customerMessage,'Temporarily read-only');
});

test('account override can change one tier without mutating defaults',()=>{
  const overridden=applyEntitlementOverride(base,'pro',{accessOverride:false,quotaOverride:3});
  assert.equal(overridden.freeAccess,true);
  assert.equal(overridden.proAccess,false);
  assert.equal(overridden.businessAccess,true);
  assert.equal(overridden.quotaPro,3);
  assert.equal(base.proAccess,true);
});

test('expired account override is ignored',()=>{
  const overridden=applyEntitlementOverride(base,'pro',{accessOverride:false,expiresAt:'2020-01-01T00:00:00.000Z'},new Date('2026-01-01T00:00:00.000Z'));
  assert.equal(overridden.proAccess,true);
});

test('invalid override expiry and quota fail closed to base entitlement',()=>{
  assert.equal(applyEntitlementOverride(base,'pro',{accessOverride:false,expiresAt:'not-a-date'}).proAccess,true);
  assert.equal(applyEntitlementOverride(base,'pro',{quotaOverride:-1}).quotaPro,base.quotaPro);
  assert.equal(applyEntitlementOverride(base,'pro',{quotaOverride:1.5}).quotaPro,base.quotaPro);
});

test('beta mode requires explicit eligibility but permits admins',()=>{
  const beta={...base,mode:'beta' as const};
  assert.equal(decideEntitlement(beta,{plan:'pro',isAdmin:false,stableRolloutBucket:0,usage:0}).reason,'BETA_NOT_ELIGIBLE');
  assert.equal(decideEntitlement(beta,{plan:'pro',isAdmin:false,betaEligible:true,stableRolloutBucket:0,usage:0}).allowed,true);
  assert.equal(decideEntitlement(beta,{plan:'pro',isAdmin:true,stableRolloutBucket:0,usage:0}).allowed,true);
});
