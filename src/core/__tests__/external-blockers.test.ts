import test from 'node:test';import assert from 'node:assert/strict';import{certifyExternalBlockers,labelExternalBlocker}from'../external-blockers';
test('labels exact missing prerequisite',()=>{assert.deepEqual(labelExternalBlocker('Email provider','credential','API key'),{integration:'Email provider',kind:'credential',missing:'API key',status:'needs_connection'})});
test('accepts explicit blockers',()=>{assert.equal(certifyExternalBlockers([labelExternalBlocker('Ads','external_approval','account approval')]),true)});
test('rejects vague blockers',()=>{assert.equal(certifyExternalBlockers([{integration:'Ads',kind:'external_approval',missing:'',status:'needs_connection'}]),false)});
test('requires exact details',()=>{assert.throws(()=>labelExternalBlocker('','authorization','OAuth consent'),/EXTERNAL_BLOCKER_DETAIL_REQUIRED/)});
