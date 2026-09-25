import test from 'node:test';import assert from 'node:assert/strict';import {deriveProductionGateState} from '../production-readiness-state';

test('disconnected production never passes smoke verification',()=>assert.deepEqual(deriveProductionGateState({connected:false,wordpressReady:true,failedChecks:[]}),{productionConnected:false,productionSmokeTests:false}));
test('connected WordPress with failed checks remains blocked',()=>assert.deepEqual(deriveProductionGateState({connected:true,wordpressReady:false,failedChecks:['database']}),{productionConnected:true,productionSmokeTests:false}));
test('only connected fully ready WordPress passes production smoke gate',()=>assert.deepEqual(deriveProductionGateState({connected:true,wordpressReady:true,failedChecks:[]}),{productionConnected:true,productionSmokeTests:true}));
