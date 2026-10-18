import test from 'node:test';
import assert from 'node:assert/strict';
import { applyContentEvent, createContentRecord, transitionContent, type ContentActor, type ContentEvent, type ContentRecord, type ContentStore } from '../content-lifecycle';
import { preparePublication, type PublicationClaimStore, type PublicationGate } from '../publication-handoff';
import { reserveProductionBudget, type BudgetDatabase, type BudgetReservation } from '../ai-budget-ledger';
import type { ProductionPolicy, ProductionRequest } from '../ai-budget-engine';
import { JobRunner, type JobStore } from '../jobs';
import type { Job } from '../types';

const at = '2026-10-18T00:00:00.000Z';
const actor: ContentActor = { userId: 'owner-1', organizationId: 'org-a', websiteId: 'site-a', role: 'owner' };
let sequence = 0;
const event = <T extends ContentEvent['kind']>(kind: T, fields: Omit<Extract<ContentEvent, { kind: T }>, 'kind' | 'eventId' | 'at'>): ContentEvent =>
  ({ kind, eventId: `evt-${++sequence}`, at, ...fields } as ContentEvent);
const source = { url: 'https://evidence.invalid/article', observedAt: at, claim: 'Synthetic fact for review' };
const quality = { factual: true, original: true, rightsCleared: true, disclosureChecked: true, ymylReviewed: true, notes: 'Synthetic review' };
function ready(): ContentRecord {
  let row = createContentRecord({ id: 'content-1', organizationId: 'org-a', websiteId: 'site-a', contentType: 'blog' });
  row = transitionContent(row, event('research', { sources: [source] }), actor);
  row = transitionContent(row, event('draft', { text: 'Synthetic original draft with a clear factual source.' }), actor);
  row = transitionContent(row, event('quality', { evidence: quality, regulated: false }), actor);
  row = transitionContent(row, event('approve', {}), actor);
  return transitionContent(row, event('schedule', { channel: 'website', publishAt: '2026-10-19T00:00:00.000Z' }), actor);
}

test('research to attribution requires sources, quality, human approval, schedule and trusted publication evidence', () => {
  const scheduled = ready();
  assert.equal(scheduled.stage, 'scheduled');
  assert.equal(scheduled.version, 5);
  assert.throws(() => transitionContent(scheduled, event('confirm_publication', { providerId: 'remote-1', url: 'https://site.invalid/post', observedAt: at }), actor), /PUBLICATION_EVIDENCE_REQUIRED/);
  const trusted = { ...actor, trustedProviderEvidence: true };
  const published = transitionContent(scheduled, event('confirm_publication', { providerId: 'remote-1', url: 'https://site.invalid/post', observedAt: at }), trusted);
  const attributed = transitionContent(published, event('attribute', { source: 'synthetic-event-log', observedAt: at, conversions: 0 }), actor);
  assert.equal(attributed.stage, 'attributed');
  assert.equal(attributed.attribution?.conversions, 0);
  assert.equal(scheduled.stage, 'scheduled');
});

test('foreign organization, viewer, stale event and unlicensed or regulated content fail closed', () => {
  const row = createContentRecord({ id: 'c', organizationId: 'org-a', websiteId: 'site-a', contentType: 'blog' });
  const research = event('research', { sources: [source] });
  assert.throws(() => transitionContent(row, research, { ...actor, organizationId: 'org-b' }), /CONTENT_SCOPE_DENIED/);
  assert.throws(() => transitionContent(row, research, { ...actor, role: 'viewer' }), /CONTENT_ROLE_DENIED/);
  assert.throws(() => transitionContent(row, event('research', { sources: [{ ...source, url: 'http://unsafe.invalid' }] }), actor), /SOURCE_EVIDENCE_REQUIRED/);
  const researched = transitionContent(row, research, actor);
  assert.throws(() => transitionContent(researched, research, actor), /INVALID_CONTENT_EVENT/);
  const draft = transitionContent(researched, event('draft', { text: 'Synthetic draft with sufficient length.' }), actor);
  assert.throws(() => transitionContent(draft, event('quality', { evidence: { ...quality, factual: 1 } as unknown as typeof quality, regulated: false }), actor), /INVALID_QUALITY_EVIDENCE/);
  const review = transitionContent(draft, event('quality', { evidence: { ...quality, rightsCleared: false }, regulated: true }), actor);
  assert.equal(review.stage, 'review_required');
  assert.throws(() => transitionContent(review, event('approve', {}), actor), /APPROVAL_REQUIRED/);
  const stillReview = transitionContent(review, event('quality', { evidence: { ...quality, ymylReviewed: false }, regulated: true }), actor);
  assert.equal(stillReview.stage, 'review_required');
});

test('compare-and-swap store refuses stale concurrent changes and cross-tenant writes', async () => {
  let current = ready();
  const store: ContentStore = { update: async (org, site, id, version, apply) => {
    if (org !== current.organizationId || site !== current.websiteId || id !== current.id) throw Error('CONTENT_SCOPE_DENIED');
    if (version !== current.version) throw Error('STALE_CONTENT_VERSION');
    current = apply(current); return current;
  } };
  const oldVersion = current.version;
  await applyContentEvent(store, current.id, oldVersion, event('cancel', {}), actor);
  await assert.rejects(() => applyContentEvent(store, current.id, oldVersion, event('cancel', {}), actor), /STALE_CONTENT_VERSION/);
  await assert.rejects(() => applyContentEvent(store, current.id, current.version, event('cancel', {}), { ...actor, organizationId: 'org-b' }), /CONTENT_SCOPE_DENIED/);
});

test('publication handoff is single-claim, gated, due, and ambiguous outcomes require status inquiry', async () => {
  const scheduled = ready();
  const claims = new Set<string>();
  const store: PublicationClaimStore = { claimOnce: async claim => !claims.has(claim.idempotencyKey) && (claims.add(claim.idempotencyKey), true) };
  const gate: PublicationGate = { organizationId: 'org-a', websiteId: 'site-a', channel: 'website', globalPaused: false,
    publishingEnabled: false, connectorVerified: true, reservationId: 'reservation-1', approvalVerified: true };
  await assert.rejects(() => preparePublication(scheduled, gate, store, '2026-10-20T00:00:00Z'), /PUBLISHING_DISABLED/);
  assert.equal(claims.size, 0);
  const syntheticGate = { ...gate, publishingEnabled: true }; // Pure contract test: no provider is called.
  await assert.rejects(() => preparePublication(scheduled, syntheticGate, store, at), /SCHEDULE_NOT_DUE/);
  await assert.rejects(() => preparePublication(scheduled, { ...syntheticGate, connectorVerified: false }, store, '2026-10-20T00:00:00Z'), /CONNECTOR_UNAVAILABLE/);
  const prepared = await preparePublication(scheduled, syntheticGate, store, '2026-10-20T00:00:00Z');
  assert.equal(prepared.status, 'prepared'); assert.equal(claims.size, 1);
  await assert.rejects(() => preparePublication(scheduled, syntheticGate, store, '2026-10-20T00:00:00Z'), /PUBLICATION_ALREADY_CLAIMED_CHECK_REMOTE/);
  const unknown = transitionContent(scheduled, event('publication_unknown', {}), actor);
  await assert.rejects(() => preparePublication(unknown, syntheticGate, store, '2026-10-20T00:00:00Z'), /REMOTE_STATUS_CHECK_REQUIRED/);
  assert.throws(() => transitionContent(unknown, event('cancel', {}), actor), /CANCELLATION_REQUIRES_STATUS_CHECK/);
});

test('two concurrent reservations for the final site quota yield exactly one approval', async () => {
  const request: ProductionRequest = { organizationId: 'org-a', websiteId: 'site-a', contentType: 'blog', idempotencyKey: 'one', estimatedCostMinor: 20, maximumJobCostMinor: 20, requestedUnits: 1 };
  const policy: ProductionPolicy = { websiteActive: true, automationEnabled: true, globalPaused: false, connectorReady: true,
    weeklyLimit: 1, weeklyUsedAndReserved: 0, websiteMonthlyLimitMinor: 20, websiteSpentAndReservedMinor: 0,
    organizationMonthlyLimitMinor: 20, organizationSpentAndReservedMinor: 0 };
  let lock = Promise.resolve(); const rows: BudgetReservation[] = [];
  const db: BudgetDatabase = { withSerializableBudgetTransaction: async (_org, _site, work) => {
    const previous = lock; let release!: () => void; lock = new Promise<void>(resolve => { release = resolve; });
    await previous;
    try { return await work({ findExisting: async (org, key) => rows.find(r => r.organizationId === org && r.idempotencyKey === key) ?? null,
      loadPolicy: async () => ({ ...policy, weeklyUsedAndReserved: rows.length, websiteSpentAndReservedMinor: rows.length * 20, organizationSpentAndReservedMinor: rows.length * 20 }),
      insertReservation: async input => { const row: BudgetReservation = { id: `res-${rows.length}`, organizationId: input.organizationId, websiteId: input.websiteId, contentType: input.contentType,
        idempotencyKey: input.idempotencyKey, estimatedCostMinor: input.estimatedCostMinor, requestedUnits: input.requestedUnits, status: 'reserved' }; rows.push(row); return row; } }); }
    finally { release(); }
  } };
  const results = await Promise.all([reserveProductionBudget(db, request), reserveProductionBudget(db, { ...request, idempotencyKey: 'two' })]);
  assert.deepEqual(results.map(r => r.decision.code).sort(), ['APPROVED','WEEKLY_QUOTA_EXCEEDED']);
  assert.equal(rows.length, 1);
});

test('synthetic provider failure retries with backoff and cancellation does not dispatch', async () => {
  const job: Job = { id: 'job-1', siteId: 'site-a', type: 'research', status: 'queued', idempotencyKey: 'research-1', attempts: 1, maxAttempts: 3, createdAt: at };
  let retryAt: Date | undefined; let succeeded = 0;
  const store: JobStore = { claim: async () => job, succeed: async () => { succeeded++; }, fail: async (_id, _error, next) => { retryAt = next; } };
  const runner = new JobRunner(store, { research: async () => { throw Error('provider token=synthetic-secret unavailable'); } }, { timeoutMs: 1000 });
  assert.equal(await runner.runOne('offline-worker'), 'failed');
  assert.ok(retryAt && retryAt.getTime() > Date.now()); assert.equal(succeeded, 0);
  const cancelled = transitionContent(ready(), event('cancel', {}), actor);
  assert.equal(cancelled.stage, 'cancelled');
  await assert.rejects(() => preparePublication(cancelled, { organizationId: 'org-a', websiteId: 'site-a', channel: 'website', globalPaused: false,
    publishingEnabled: true, connectorVerified: true, reservationId: 'res', approvalVerified: true }, { claimOnce: async () => { throw Error('SHOULD_NOT_CLAIM'); } }, '2026-10-20T00:00:00Z'), /PUBLICATION_NOT_APPROVED/);
});
