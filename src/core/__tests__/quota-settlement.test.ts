import test from 'node:test';
import assert from 'node:assert/strict';
import { siteQuotaWeek } from '../quota-periods';
import { reserveQuota, applyAccountingEvent, type AccountingStore, type AccountingEvent, type Ledger, type Policy, type Scope } from '../quota-settlement';
const now = '2026-10-19T12:00:00.000Z';
const grant = { checkedAt: now, expiresAt: '2026-10-19T12:05:00.000Z', revision: 'membership-policy-1' };
const scope: Scope = { organizationId: 'org-a', websiteId: 'site-a', contentType: 'blog' };
const req = { currency: 'USD', id: 'r1', key: 'key1', units: 1, estimate: 20n, expiresAt: '2026-10-20T00:00:00.000Z' };
/** Serialized clone/commit synthetic adapter, NOT MariaDB certification. */
function fixture() {
  let ledger: Ledger = { reservations: [], events: {}, evidence: {}, paused: false };
  let tail = Promise.resolve();
  let allowed = true, verified = true;
  let p: Policy | null = { authorization: grant, currency: 'USD', timezoneRulesVersion: process.versions.tz!, timezone: 'America/New_York', weeklyLimit: 1, siteLimit: 40n, portfolioLimit: 40n, maximumJobCost: 30n, enabled: true };
  const store: AccountingStore = { async serializable(org, work) {
    const previous = tail; let release!: () => void;
    tail = new Promise<void>(resolve => { release = resolve; }); await previous;
    try {
      const copy = structuredClone(ledger);
      const result = await work({ ledger: copy, authorize: async (s, clock) => allowed && org === scope.organizationId && s.organizationId === scope.organizationId && ['site-a', 'site-b'].includes(s.websiteId) ? p && { ...p, authorization: { ...p.authorization, checkedAt: clock, expiresAt: new Date(Date.parse(clock) + 60000).toISOString() } } : null, verifyEvidence: async () => verified });
      ledger = copy; return result;
    } finally { release(); }
  } };
  return { store, ledger: () => structuredClone(ledger), deny: () => { allowed = false; }, unverify: () => { verified = false; }, policy: (value: Policy | null) => { p = value; } };
}
const event = (kind: 'start' | 'complete' | 'fail' | 'cancel' | 'expire', expectedVersion: number): AccountingEvent => ({ id: `${kind}-${expectedVersion}`, reservationId: 'r1', expectedVersion, kind });
const charge: AccountingEvent = { id: 'charge', reservationId: 'r1', expectedVersion: 1, kind: 'charge', evidenceId: 'issuer-charge-1', amount: 15n };

test('local Monday boundaries handle DST, fractional offsets and UTC portfolio months', () => {
  for (const [date, hours] of [['2026-03-08T12:00:00.000Z', 167], ['2026-11-01T12:00:00.000Z', 169]] as const) {
    const p = siteQuotaWeek(date, 'America/New_York');
    assert.equal((Date.parse(p.endsAt) - Date.parse(p.startsAt)) / 3600000, hours);
  }
  const india = siteQuotaWeek('2026-03-01T23:30:00.000Z', 'Asia/Kolkata');
  assert.equal(india.localMonday, '2026-03-02'); assert.equal(india.startsAt, '2026-03-01T18:30:00.000Z'); assert.equal(india.portfolioMonth, '2026-03-01');
  assert.equal(siteQuotaWeek('2026-04-05T12:00:00.000Z', 'Australia/Lord_Howe').endsAt, '2026-04-05T13:30:00.000Z');
});
test('unknown zones, missing configuration and noncanonical timestamps fail closed', () => {
  for (const tz of ['', 'Mars/Olympus', '+05:30', 'EST']) assert.throws(() => siteQuotaWeek(now, tz));
  assert.throws(() => siteQuotaWeek('2026-10-19', 'UTC'));
});
test('simultaneous reservations compete atomically for the last slot', async () => {
  const f = fixture();
  const results = await Promise.allSettled(Array.from({ length: 20 }, (_, i) => reserveQuota(f.store, scope, { ...req, id: `r${i}`, key: `key${i}` }, now)));
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(f.ledger().reservations.length, 1);
});
test('reservation replay does not consume twice and rejects changed scope/payload', async () => {
  const f = fixture(); await reserveQuota(f.store, scope, req, now);
  await reserveQuota(f.store, scope, req, now);
  await assert.rejects(reserveQuota(f.store, scope, { ...req, estimate: 21n }, now), /REPLAY/);
  await assert.rejects(reserveQuota(f.store, { ...scope, websiteId: 'foreign' }, req, now));
  assert.equal(f.ledger().reservations.length, 1);
});
test('predispatch cancellation and expiry release held capacity and money', async () => {
  for (const kind of ['cancel', 'expire'] as const) {
    const f = fixture(); await reserveQuota(f.store, scope, req, now);
    await applyAccountingEvent(f.store, scope, event(kind, 0), kind === 'expire' ? req.expiresAt : now);
    await reserveQuota(f.store, scope, { ...req, id: 'r2', key: 'key2', expiresAt: '2026-10-21T00:00:00.000Z' }, kind === 'expire' ? req.expiresAt : now);
    await assert.rejects(applyAccountingEvent(f.store, scope, event('start', 1), now));
  }
});
test('failed chargeable execution retains weekly units and conservative hold until settlement', async () => {
  const f = fixture(); await reserveQuota(f.store, scope, req, now);
  await applyAccountingEvent(f.store, scope, event('start', 0), now);
  await applyAccountingEvent(f.store, scope, charge, now);
  await applyAccountingEvent(f.store, scope, event('fail', 2), now);
  await assert.rejects(applyAccountingEvent(f.store, scope, event('cancel', 3), now));
  await assert.rejects(applyAccountingEvent(f.store, scope, { id: 'settle-bad', reservationId: 'r1', expectedVersion: 3, kind: 'settle', evidenceId: 'final-bad', gross: 14n }, now));
  await applyAccountingEvent(f.store, scope, { id: 'settle', reservationId: 'r1', expectedVersion: 3, kind: 'settle', evidenceId: 'final', gross: 15n }, now);
  await assert.rejects(reserveQuota(f.store, scope, { ...req, id: 'r2', key: 'key2' }, now), /QUOTA/);
  assert.equal(f.ledger().reservations[0].settled, true);
});
test('unique charge/refund evidence and event replay cannot double-charge or double-refund', async () => {
  const f = fixture(); await reserveQuota(f.store, scope, req, now); await applyAccountingEvent(f.store, scope, event('start', 0), now);
  await applyAccountingEvent(f.store, scope, charge, now); await applyAccountingEvent(f.store, scope, charge, now);
  await assert.rejects(applyAccountingEvent(f.store, scope, { ...charge, id: 'duplicate-proof', expectedVersion: 2 }, now), /REPLAYED/);
  await assert.rejects(applyAccountingEvent(f.store, scope, { ...charge, amount: 16n }, now), /REPLAY_CONFLICT/);
  const refund: AccountingEvent = { id: 'refund', kind: 'refund', reservationId: 'r1', expectedVersion: 2, evidenceId: 'refund-proof', chargeId: 'issuer-charge-1', amount: 10n };
  await applyAccountingEvent(f.store, scope, refund, now); await applyAccountingEvent(f.store, scope, refund, now);
  await assert.rejects(applyAccountingEvent(f.store, scope, { ...refund, id: 'refund-more', evidenceId: 'other-refund', expectedVersion: 3, amount: 6n }, now), /INVALID_REFUND/);
  assert.equal(Object.keys(f.ledger().reservations[0].charges).length, 1); assert.equal(Object.keys(f.ledger().reservations[0].refunds).length, 1);
});
test('stale versions, authorization and untrusted settlement evidence are refused with rollback', async () => {
  const f = fixture(); await reserveQuota(f.store, scope, req, now); await applyAccountingEvent(f.store, scope, event('start', 0), now);
  await assert.rejects(applyAccountingEvent(f.store, scope, event('fail', 0), now), /STALE/);
  f.unverify(); await assert.rejects(applyAccountingEvent(f.store, scope, charge, now), /INVALID_OR/);
  assert.equal(f.ledger().reservations[0].version, 1);
  f.deny(); await assert.rejects(applyAccountingEvent(f.store, scope, event('start', 0), now), /AUTHORIZATION/);
  await assert.rejects(reserveQuota(f.store, scope, req, now), /AUTHORIZATION/);
});
test('cross-tenant events and missing budget state are refused', async () => {
  const f = fixture(); await reserveQuota(f.store, scope, req, now);
  await assert.rejects(applyAccountingEvent(f.store, { ...scope, organizationId: 'org-b' }, event('start', 0), now));
  await assert.rejects(applyAccountingEvent(f.store, { ...scope, contentType: 'email' }, event('start', 0), now), /NOT_FOUND/);
  f.policy(null); await assert.rejects(applyAccountingEvent(f.store, scope, event('start', 0), now));
});
test('expiry, timezone policy changes and disabled execution cannot dispatch', async () => {
  const f = fixture(); await reserveQuota(f.store, scope, req, now);
  await assert.rejects(applyAccountingEvent(f.store, scope, event('start', 0), req.expiresAt), /DISPATCH/);
  f.policy({ authorization: grant, currency: 'USD', timezoneRulesVersion: process.versions.tz!, timezone: 'UTC', weeklyLimit: 1, siteLimit: 40n, portfolioLimit: 40n, maximumJobCost: 30n, enabled: true });
  await assert.rejects(applyAccountingEvent(f.store, scope, event('start', 0), now), /DISPATCH/);
});
test('provider overrun is recorded and atomically pauses new reservations', async () => {
  const f = fixture(); await reserveQuota(f.store, scope, req, now); await applyAccountingEvent(f.store, scope, event('start', 0), now);
  await applyAccountingEvent(f.store, scope, { ...charge, amount: 50n }, now);
  assert.equal(f.ledger().paused, true);
  await assert.rejects(reserveQuota(f.store, scope, { ...req, key: 'k2', id: 'r2' }, now), /DISABLED/);
});
test('portfolio cap applies across content types and bigint values stay exact', async () => {
  const f = fixture(); await reserveQuota(f.store, scope, req, now);
  await reserveQuota(f.store, { ...scope, contentType: 'email' }, { ...req, id: 'r2', key: 'k2' }, now);
  await assert.rejects(reserveQuota(f.store, { ...scope, contentType: 'image' }, { ...req, id: 'r3', key: 'k3' }, now), /BUDGET/);
  assert.equal(f.ledger().reservations.reduce((v, r) => v + r.estimate, 0n), 40n);
});

test('timezone changes cannot reset an overlapping weekly quota; rule and currency changes fail closed', async () => {
  const f = fixture(); await reserveQuota(f.store, scope, req, now);
  const p = { authorization: grant, currency: 'USD', timezoneRulesVersion: process.versions.tz!, timezone: 'UTC', weeklyLimit: 100, siteLimit: 40n, portfolioLimit: 40n, maximumJobCost: 30n, enabled: true };
  f.policy(p);
  await assert.rejects(reserveQuota(f.store, scope, { ...req, id: 'r2', key: 'k2' }, now), /OVERLAPPING_TIMEZONE/);
  f.policy({ ...p, timezoneRulesVersion: 'unreviewed' });
  await assert.rejects(reserveQuota(f.store, scope, req, now), /TIMEZONE_RULES/);
  f.policy({ ...p, timezone: 'America/New_York', currency: 'EUR' });
  await assert.rejects(reserveQuota(f.store, scope, { ...req, id: 'r2', key: 'k2' }, now), /CURRENCY/);
});
test('concurrent compare-and-swap events commit once; failed transitions leave no replay record', async () => {
  const f = fixture(); await reserveQuota(f.store, scope, req, now);
  const results = await Promise.allSettled([applyAccountingEvent(f.store, scope, event('start', 0), now), applyAccountingEvent(f.store, scope, event('cancel', 0), now)]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(f.ledger().reservations[0].version, 1); assert.equal(Object.keys(f.ledger().events).length, 1);
});
test('disabled and reduced-budget policies refuse dispatch but allow safe cancellation', async () => {
  for (const change of [{ enabled: false }, { portfolioLimit: 0n }, { weeklyLimit: 0 }]) {
    const f = fixture(); await reserveQuota(f.store, scope, req, now);
    f.policy({ authorization: grant, currency: 'USD', timezoneRulesVersion: process.versions.tz!, timezone: 'America/New_York', weeklyLimit: 1, siteLimit: 40n, portfolioLimit: 40n, maximumJobCost: 30n, enabled: true, ...change });
    await assert.rejects(applyAccountingEvent(f.store, scope, event('start', 0), now));
    await applyAccountingEvent(f.store, scope, event('cancel', 0), now);
  }
});
test('prototype-shaped evidence IDs and malformed dates are refused', async () => {
  assert.throws(() => siteQuotaWeek('2026-02-30T00:00:00.000Z', 'UTC'));
  const f = fixture(); await reserveQuota(f.store, scope, req, now); await applyAccountingEvent(f.store, scope, event('start', 0), now);
  await assert.rejects(applyAccountingEvent(f.store, scope, { ...charge, evidenceId: '__proto__' }, now));
});

test('expired authorization snapshots fail closed even when an adapter returns a policy', async () => {
  const f = fixture();
  const stale: AccountingStore = { serializable: (org, work) => f.store.serializable(org, tx => work({ ...tx, authorize: async (s, clock, op) => { const p = await tx.authorize(s, clock, op); return p && { ...p, authorization: { ...grant, expiresAt: now } }; } })) };
  await assert.rejects(reserveQuota(stale, scope, req, now), /STALE_AUTHORIZATION/);
  assert.equal(f.ledger().reservations.length, 0);
});
test('skipped local Monday midnight is refused instead of silently shifting the week', () => {
  assert.throws(() => siteQuotaWeek('2021-03-23T12:00:00.000Z', 'Asia/Tehran'), /MISSING_WEEK_BOUNDARY/);
});
test('two websites compete for one portfolio budget under the same organization lock', async () => {
  const f = fixture(); f.policy({ authorization: grant, currency: 'USD', timezoneRulesVersion: process.versions.tz!, timezone: 'America/New_York', weeklyLimit: 10, siteLimit: 20n, portfolioLimit: 20n, maximumJobCost: 20n, enabled: true });
  const results = await Promise.allSettled(['site-a', 'site-b'].map((websiteId, i) => reserveQuota(f.store, { ...scope, websiteId }, { ...req, id: `r${i}`, key: `k${i}` }, now)));
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
});
test('integer minor units above Number precision remain exact; negative and excessive values refuse', async () => {
  const f = fixture(); const large = 9007199254740993n;
  f.policy({ authorization: grant, currency: 'USD', timezoneRulesVersion: process.versions.tz!, timezone: 'America/New_York', weeklyLimit: 10, siteLimit: large, portfolioLimit: large, maximumJobCost: large, enabled: true });
  const result = await reserveQuota(f.store, scope, { ...req, estimate: large }, now);
  assert.equal(result.estimate, large);
  await assert.rejects(reserveQuota(f.store, scope, { ...req, key: 'k2', id: 'r2', estimate: 1n }, now), /BUDGET/);
  for (const estimate of [-1n, 18446744073709551616n]) await assert.rejects(reserveQuota(f.store, scope, { ...req, estimate }, now));
});
test('terminal settlement cannot be reopened, and a later verified refund never restores quota', async () => {
  const f = fixture(); await reserveQuota(f.store, scope, req, now); await applyAccountingEvent(f.store, scope, event('start', 0), now);
  await applyAccountingEvent(f.store, scope, charge, now); await applyAccountingEvent(f.store, scope, event('complete', 2), now);
  await applyAccountingEvent(f.store, scope, { id: 'settle', reservationId: 'r1', expectedVersion: 3, kind: 'settle', evidenceId: 'final-proof', gross: 15n }, now);
  await applyAccountingEvent(f.store, scope, { id: 'refund', reservationId: 'r1', expectedVersion: 4, kind: 'refund', evidenceId: 'refund-proof', chargeId: 'issuer-charge-1', amount: 15n }, now);
  await assert.rejects(applyAccountingEvent(f.store, scope, { ...charge, id: 'late-charge', evidenceId: 'late-proof', expectedVersion: 5 }, now), /INVALID_CHARGE/);
  await assert.rejects(reserveQuota(f.store, scope, { ...req, id: 'r2', key: 'k2' }, now), /QUOTA/);
});
test('viewer or revoked-role authorization refuses both reservations and event replay', async () => {
  const f = fixture(); await reserveQuota(f.store, scope, req, now); await applyAccountingEvent(f.store, scope, event('start', 0), now);
  const viewer: AccountingStore = { serializable: (org, work) => f.store.serializable(org, tx => work({ ...tx, authorize: async () => null })) };
  await assert.rejects(reserveQuota(viewer, scope, req, now), /AUTHORIZATION/);
  await assert.rejects(applyAccountingEvent(viewer, scope, event('start', 0), now), /AUTHORIZATION/);
});
