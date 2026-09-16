import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { decideEntitlement, type Entitlement } from '../entitlements';

const base:Entitlement={mode:'on',freeAccess:true,proAccess:true,businessAccess:true,quotaFree:5,quotaPro:50,quotaBusiness:null,rolloutPercent:100,emergencyKill:false,failSafe:'deny'};

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

test('percentage rollout uses stable bucket',()=>{
  assert.equal(decideEntitlement({...base,rolloutPercent:10},{plan:'pro',isAdmin:false,stableRolloutBucket:10,usage:0}).reason,'ROLLOUT');
  assert.equal(decideEntitlement({...base,rolloutPercent:10},{plan:'pro',isAdmin:false,stableRolloutBucket:9,usage:0}).allowed,true);
});

test('maintenance defaults closed',()=>{
  assert.equal(decideEntitlement({...base,mode:'maintenance'},{plan:'pro',isAdmin:false,stableRolloutBucket:0,usage:0}).allowed,false);
});
