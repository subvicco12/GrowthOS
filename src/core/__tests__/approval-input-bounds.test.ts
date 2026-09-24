import test from 'node:test';
import assert from 'node:assert/strict';
import { approvalRequest } from '../approval-request';

test('approval request accepts bounded idempotency keys and notes',()=>{
 assert.equal(approvalRequest({recommendationId:'1',action:'approve',idempotencyKey:'x'.repeat(128),note:'n'.repeat(2000)}).recommendationId,'1');
});
test('approval request rejects oversized idempotency keys',()=>{
 assert.throws(()=>approvalRequest({recommendationId:'1',action:'approve',idempotencyKey:'x'.repeat(129)}),/APPROVAL_REQUEST_INVALID/);
});
test('approval request rejects oversized notes',()=>{
 assert.throws(()=>approvalRequest({recommendationId:'1',action:'approve',idempotencyKey:'key',note:'n'.repeat(2001)}),/APPROVAL_REQUEST_INVALID/);
});
