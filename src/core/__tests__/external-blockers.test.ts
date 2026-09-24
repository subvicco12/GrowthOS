import test from 'node:test';import assert from 'node:assert/strict';import { certifyExternalBlockers,labelExternalBlocker } from '../external-blockers';
test('labels exact missing prerequisite as needs connection',()=>{assert.deepEqual(labelExternalBlocker('Email provider','credential','API key'),{integration:'Email provider',kind:'credential',missing:'API key',status:'needs_connection'})});
test('certifies an empty blocker set',()=>{assert.equal(certifyExternalBlockers([]),true)});
test('rejects vague blocker records',()=>{assert.equal(certifyExternalBlockers([{integration:'Ads',kind:'external_approval',missing:'',status:'needs_connection'}]),false)});
test('requires exact blocker details',()=>{assert.throws(()=>labelExternalBlocker('','authorization','OAuth consent'),/EXTERNAL_BLOCKER_DETAIL_REQUIRED/)});
