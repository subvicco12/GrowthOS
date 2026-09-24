import test from 'node:test';import assert from 'node:assert/strict';import { certifySecurityGate } from '../security-gate-certification';
const complete={connectorAuthentication:true,rbac:true,crossSiteIsolation:true,auditRedaction:true,recoveryRollback:true,httpsProduction:true,fileEditingDisabled:true};
test('passes only complete security evidence',()=>{assert.deepEqual(certifySecurityGate(complete),{passed:true,failures:[]})});
test('fails closed when production file editing is enabled',()=>{const r=certifySecurityGate({...complete,fileEditingDisabled:false});assert.equal(r.passed,false);assert.deepEqual(r.failures,['fileEditingDisabled'])});
test('reports every missing critical security control',()=>{const r=certifySecurityGate({...complete,connectorAuthentication:false,recoveryRollback:false});assert.deepEqual(r.failures,['connectorAuthentication','recoveryRollback'])});
