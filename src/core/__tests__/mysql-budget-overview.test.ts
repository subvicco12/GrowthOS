import test from 'node:test';
import assert from 'node:assert/strict';
import { projectBudgetRows } from '../../server/mysql-budget-overview';
import { projectRecordedCosts } from '../../server/mysql-cost-projection';

const row = { websiteId: 'site', domain: 'site.test', status: 'draft', verified: 0,
  enabledContentTypes: '2', weeklyUnits: '9', configuredMonthlyMinor: '9007199254740993' };
test('read-only budget projection preserves exact minor units and bounded capacity', () => {
  assert.deepEqual(projectBudgetRows([row] as never), [{ websiteId: 'site', domain: 'site.test', status: 'draft',
    verified: false, enabledContentTypes: 2, weeklyUnits: 9, configuredMonthlyMinor: '9007199254740993' }]);
  assert.throws(() => projectBudgetRows([{ ...row, weeklyUnits: '9007199254740993' }] as never), /UNSAFE_BUDGET_COUNT/);
  assert.throws(() => projectBudgetRows([{ ...row, configuredMonthlyMinor: 9007199254740993 }] as never), /UNSAFE_DATABASE_INTEGER/);
  assert.throws(() => projectBudgetRows([{ ...row, enabledContentTypes: '-1' }] as never), /UNSAFE_DATABASE_INTEGER/);
  assert.equal(projectBudgetRows([{ ...row, verified: '0' }] as never)[0].verified, false);
});
test('recorded costs reject rounded, negative and unparseable accounting totals', () => {
  assert.deepEqual(projectRecordedCosts([{ website_id:'site', recorded_minor:'9007199254740993', completed_count:'1' }] as never),
    [{ websiteId:'site', recordedMinor:'9007199254740993', completedCount:1 }]);
  for (const field of ['recorded_minor','completed_count'] as const) {
    assert.throws(() => projectRecordedCosts([{ website_id:'site', recorded_minor:'1', completed_count:'1', [field]:'-1' }] as never), /UNSAFE_DATABASE_INTEGER/);
  }
  assert.throws(() => projectRecordedCosts([{ website_id:'site', recorded_minor:'1', completed_count:'9007199254740993' }] as never), /UNSAFE_COST_COUNT/);
});
