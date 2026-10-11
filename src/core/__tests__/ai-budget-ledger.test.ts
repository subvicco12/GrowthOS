import test from 'node:test';
import assert from 'node:assert/strict';
import { reserveProductionBudget, type BudgetDatabase, type BudgetReservation } from '../ai-budget-ledger';
import type { ProductionRequest, ProductionPolicy } from '../ai-budget-engine';

const request: ProductionRequest = {
  organizationId: 'org-1', websiteId: 'site-1', contentType: 'blog',
  idempotencyKey: 'job-1', estimatedCostMinor: 25, maximumJobCostMinor: 30, requestedUnits: 1
};
const policy: ProductionPolicy = {
  websiteActive: true, automationEnabled: true, globalPaused: false,
  connectorReady: true, weeklyLimit: 2, weeklyUsedAndReserved: 0,
  websiteMonthlyLimitMinor: 100, websiteSpentAndReservedMinor: 0,
  organizationMonthlyLimitMinor: 100, organizationSpentAndReservedMinor: 0
};
test('reservation service checks policy inside transaction and inserts once', async () => {
  let inserts = 0;
  let saved: BudgetReservation | null = null;
  const db: BudgetDatabase = {
    withSerializableBudgetTransaction: async (_org, _site, work) => work({
      findExisting: async () => saved,
      loadPolicy: async () => policy,
      insertReservation: async r => {
        inserts++;
        saved = { id: 'res-1', organizationId: r.organizationId, websiteId: r.websiteId,
          idempotencyKey: r.idempotencyKey, estimatedCostMinor: r.estimatedCostMinor,
          contentType: r.contentType, requestedUnits: r.requestedUnits, status: 'reserved' };
        return saved;
      }
    })
  };
  assert.equal((await reserveProductionBudget(db, request)).decision.code, 'APPROVED');
  const again = await reserveProductionBudget(db, request);
  assert.equal(again.replayed, true);
  assert.equal(inserts, 1);
  assert.equal((await reserveProductionBudget(db, { ...request, requestedUnits: 2 })).decision.code, 'INVALID_REQUEST');
  saved = { ...saved!, status: 'completed' };
  assert.equal((await reserveProductionBudget(db, request)).decision.allowed, false);
  assert.equal((await reserveProductionBudget(db, { ...request, websiteId: 'site-2' })).decision.code, 'INVALID_REQUEST');
});
test('reservation service fails closed without a policy', async () => {
  const db: BudgetDatabase = {
    withSerializableBudgetTransaction: async (_org, _site, work) => work({
      findExisting: async () => null,
      loadPolicy: async () => null,
      insertReservation: async () => { throw new Error('should not insert'); }
    })
  };
  assert.equal((await reserveProductionBudget(db, request)).decision.code, 'DISABLED');
});
