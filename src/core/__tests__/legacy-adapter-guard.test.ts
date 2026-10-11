import test from 'node:test';
import assert from 'node:assert/strict';
import { GET as legacyDashboard } from '../../app/api/dashboard/route';
import { POST as legacyApprovals } from '../../app/api/approvals/route';

test('legacy dashboard cannot expose global WordPress data', async () => {
  const response = await legacyDashboard();
  assert.equal(response.status, 503);
  assert.equal((await response.json()).code, 'LEGACY_ADAPTER_DISABLED');
});

test('legacy approvals cannot change WordPress state', async () => {
  const response = await legacyApprovals();
  assert.equal(response.status, 503);
  assert.equal((await response.json()).code, 'LEGACY_ADAPTER_DISABLED');
});
