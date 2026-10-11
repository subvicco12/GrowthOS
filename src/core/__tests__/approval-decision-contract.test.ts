import test from 'node:test';
import assert from 'node:assert/strict';
import type { DecisionInput } from '../../server/mysql-approval-decision';

test('internal approval request contract requires tenant and actor identifiers', () => {
  const input: DecisionInput = {
    organizationId: '11111111-1111-4111-8111-111111111111',
    websiteId: '22222222-2222-4222-8222-222222222222',
    approvalId: '33333333-3333-4333-8333-333333333333',
    actorId: '44444444-4444-4444-8444-444444444444',
    idempotencyKey: 'approval-test-123',
    decision: 'approved'
  };
  assert.equal(input.decision, 'approved');
  assert.ok(input.actorId);
});
