import { siteQuotaWeek } from './quota-periods';

export type Scope = { organizationId: string; websiteId: string; contentType: string };
export type Reservation = Scope & {
  id: string; key: string; currency: string; units: number; estimate: bigint; month: string;
  week: ReturnType<typeof siteQuotaWeek>; expiresAt: string; version: number;
  state: 'reserved' | 'executing' | 'completed' | 'failed' | 'cancelled' | 'expired';
  started: boolean; settled: boolean; charges: Record<string, bigint>; refunds: Record<string, { chargeId: string; amount: bigint }>;
};
export type AccountingEvent = { id: string; reservationId: string; expectedVersion: number } & (
  { kind: 'start' | 'complete' | 'fail' | 'cancel' | 'expire' } |
  { kind: 'charge'; evidenceId: string; amount: bigint } |
  { kind: 'refund'; evidenceId: string; chargeId: string; amount: bigint } |
  { kind: 'settle'; evidenceId: string; gross: bigint }
);
export type Ledger = { reservations: Reservation[]; events: Record<string, string>; evidence: Record<string, string>; paused: boolean };
export type Policy = { authorization: { checkedAt: string; expiresAt: string; revision: string }; timezone: string; timezoneRulesVersion: string; currency: string; weeklyLimit: number; siteLimit: bigint; portfolioLimit: bigint; maximumJobCost: bigint; enabled: boolean };
export interface AccountingTransaction {
  /** Fresh membership, active organization, role and policy checks inside the lock; no cached caller role. */
  authorize(scope: Scope, now: string, operation: 'reserve' | AccountingEvent['kind']): Promise<Policy | null>;
  /** Must verify trusted issuer, signature, scope, reservation, event payload and freshness. No caller boolean. */
  verifyEvidence(scope: Scope, event: AccountingEvent, now: string): Promise<boolean>;
  ledger: Ledger;
}
/** Trusted server inputs only: now is server time; adapters must validate persisted records.
 * This module performs no dispatch and is not wired to the legacy runtime. */
export interface AccountingStore {
  /** Lock organization first, then site. Atomic commit/rollback of ledger, unique events and append-only audit. */
  serializable<T>(organizationId: string, work: (tx: AccountingTransaction) => Promise<T>): Promise<T>;
}
const fingerprint = (value: unknown) => JSON.stringify(value, (_key, v) => typeof v === 'bigint' ? `${v}n` : v);
const sum = (values: bigint[]) => values.reduce((a, b) => a + b, 0n);
const net = (r: Reservation) => sum(Object.values(r.charges)) - sum(Object.values(r.refunds).map(v => v.amount));
const held = (r: Reservation) => r.settled || (!r.started && r.state !== 'reserved') ? net(r) : (net(r) > r.estimate ? net(r) : r.estimate);
const scopeMatches = (a: Scope, b: Scope) => a.organizationId === b.organizationId && a.websiteId === b.websiteId && a.contentType === b.contentType;
const integer = (n: number) => Number.isSafeInteger(n) && n >= 0;
const amount = (n: bigint) => typeof n === 'bigint' && n >= 0n && n <= 18446744073709551615n;
function validateScope(scope: Scope) {
  if (![scope.organizationId, scope.websiteId, scope.contentType].every(v => typeof v === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(v))) throw new Error('INVALID_SCOPE');
}
async function policy(tx: AccountingTransaction, scope: Scope, now: string, operation: 'reserve' | AccountingEvent['kind']) {
  validateScope(scope);
  const p = await tx.authorize(scope, now, operation);
  if (!p || !/^[A-Z]{3}$/.test(p.currency) || !p.timezoneRulesVersion || !integer(p.weeklyLimit) || ![p.siteLimit, p.portfolioLimit, p.maximumJobCost].every(amount)) throw new Error('AUTHORIZATION_OR_BUDGET_UNAVAILABLE');
  const grant = p.authorization;
  const checked = Date.parse(grant?.checkedAt), until = Date.parse(grant?.expiresAt), at = Date.parse(now);
  if (!grant?.revision || !Number.isFinite(checked) || !Number.isFinite(until) || checked > at || until <= at || until <= checked || until - checked > 300000) throw new Error('STALE_AUTHORIZATION');
  if (siteQuotaWeek(now, p.timezone).rulesVersion !== p.timezoneRulesVersion) throw new Error('TIMEZONE_RULES_CHANGED');
  if (tx.ledger.reservations.some(r => r.organizationId !== scope.organizationId)) throw new Error('FOREIGN_LEDGER');
  return p;
}
export async function reserveQuota(store: AccountingStore, scope: Scope, request: { id: string; key: string; currency: string; units: number; estimate: bigint; expiresAt: string }, now: string) {
  validateScope(scope);
  return store.serializable(scope.organizationId, async tx => {
    const p = await policy(tx, scope, now, 'reserve');
    if (!p.enabled || tx.ledger.paused) throw new Error('DISABLED');
    const week = siteQuotaWeek(now, p.timezone);
    if (tx.ledger.reservations.some(r => r.websiteId === scope.websiteId && r.week.startsAt < week.endsAt && r.week.endsAt > week.startsAt && (r.week.timezone !== week.timezone || r.week.rulesVersion !== week.rulesVersion))) throw new Error('OVERLAPPING_TIMEZONE_CHANGE');
    if (tx.ledger.reservations.some(r => r.month === week.portfolioMonth && r.currency !== p.currency)) throw new Error('CURRENCY_CHANGED');
    if (request.currency !== p.currency || !request.id || !request.key || request.key.length > 200 || !integer(request.units) || request.units === 0 || !amount(request.estimate) || request.estimate > p.maximumJobCost || !Number.isFinite(Date.parse(request.expiresAt)) || new Date(request.expiresAt).toISOString() !== request.expiresAt || request.expiresAt <= now || request.expiresAt > week.endsAt) throw new Error('INVALID_RESERVATION');
    const previous = tx.ledger.reservations.find(r => r.key === request.key);
    if (previous) {
      if (!scopeMatches(previous, scope) || previous.id !== request.id || previous.units !== request.units || previous.estimate !== request.estimate || previous.expiresAt !== request.expiresAt || previous.state !== 'reserved' || now >= previous.expiresAt) throw new Error('RESERVATION_REPLAY_CONFLICT');
      return structuredClone(previous);
    }
    if (tx.ledger.reservations.some(r => r.id === request.id)) throw new Error('DUPLICATE_ID');
    const used = tx.ledger.reservations.filter(r => scopeMatches(r, scope) && r.week.startsAt === week.startsAt && (r.started || r.state === 'reserved')).reduce((n, r) => n + BigInt(r.units), 0n);
    if (used + BigInt(request.units) > BigInt(p.weeklyLimit)) throw new Error('QUOTA_EXHAUSTED');
    const month = tx.ledger.reservations.filter(r => r.month === week.portfolioMonth);
    if (sum(month.map(held)) + request.estimate > p.portfolioLimit || sum(month.filter(r => r.websiteId === scope.websiteId).map(held)) + request.estimate > p.siteLimit) throw new Error('BUDGET_EXHAUSTED');
    const r: Reservation = { ...scope, ...request, currency: p.currency, month: week.portfolioMonth, week, version: 0, state: 'reserved', started: false, settled: false, charges: {}, refunds: {} };
    tx.ledger.reservations.push(r);
    return structuredClone(r);
  });
}
export async function applyAccountingEvent(store: AccountingStore, scope: Scope, event: AccountingEvent, now: string) {
  validateScope(scope);
  return store.serializable(scope.organizationId, async tx => {
    const p = await policy(tx, scope, now, event.kind);
    if (!/^[A-Za-z0-9][A-Za-z0-9:_-]{0,199}$/.test(event.id) || !integer(event.expectedVersion)) throw new Error('INVALID_EVENT');
    const r = tx.ledger.reservations.find(r => r.id === event.reservationId && scopeMatches(r, scope));
    if (!r) throw new Error('NOT_FOUND');
    // Stable tuple avoids object property order affecting replay identity.
    const proof = fingerprint([scope.organizationId, scope.websiteId, scope.contentType, event.id, event.reservationId, event.expectedVersion, event.kind, 'evidenceId' in event ? event.evidenceId : null, 'amount' in event ? event.amount : null, 'chargeId' in event ? event.chargeId : null, 'gross' in event ? event.gross : null]);
    if (Object.hasOwn(tx.ledger.events, event.id)) {
      if (tx.ledger.events[event.id] !== proof) throw new Error('EVENT_REPLAY_CONFLICT');
      return structuredClone(r);
    }
    if (r.currency !== p.currency || r.week.rulesVersion !== p.timezoneRulesVersion) throw new Error('ACCOUNTING_POLICY_CHANGED');
    if (r.version !== event.expectedVersion) throw new Error('STALE_VERSION');
    if ('evidenceId' in event) {
      if (!/^[A-Za-z0-9][A-Za-z0-9:_-]{0,199}$/.test(event.evidenceId) || Object.hasOwn(tx.ledger.evidence, event.evidenceId) || !await tx.verifyEvidence(scope, event, now)) throw new Error('INVALID_OR_REPLAYED_EVIDENCE');
    }
    switch (event.kind) {
      case 'start':
        if (!p.enabled || tx.ledger.paused || r.state !== 'reserved' || now >= r.expiresAt || siteQuotaWeek(now, p.timezone).startsAt !== r.week.startsAt || siteQuotaWeek(now, p.timezone).timezone !== r.week.timezone) throw new Error('DISPATCH_REFUSED');
        const current = tx.ledger.reservations.filter(v => v.month === r.month);
        const capacity = tx.ledger.reservations.filter(v => scopeMatches(v, scope) && v.week.startsAt === r.week.startsAt && (v.started || v.state === 'reserved')).reduce((n, v) => n + BigInt(v.units), 0n);
        if (capacity > BigInt(p.weeklyLimit) || sum(current.map(held)) > p.portfolioLimit || sum(current.filter(v => v.websiteId === scope.websiteId).map(held)) > p.siteLimit || r.estimate > p.maximumJobCost) throw new Error('BUDGET_OR_QUOTA_CHANGED');
        r.started = true; r.state = 'executing'; break;
      case 'complete': case 'fail':
        if (r.state !== 'executing') throw new Error('INVALID_TRANSITION');
        r.state = event.kind === 'complete' ? 'completed' : 'failed'; break;
      case 'cancel': case 'expire':
        if (r.state !== 'reserved' || (event.kind === 'expire' && now < r.expiresAt)) throw new Error('INVALID_TRANSITION');
        r.state = event.kind === 'cancel' ? 'cancelled' : 'expired'; break;
      case 'charge':
        if (!r.started || r.settled || !amount(event.amount) || event.amount === 0n) throw new Error('INVALID_CHARGE');
        r.charges[event.evidenceId] = event.amount;
        if (net(r) > r.estimate) tx.ledger.paused = true;
        break;
      case 'refund': {
        const charge = r.charges[event.chargeId];
        const refunded = sum(Object.values(r.refunds).filter(v => v.chargeId === event.chargeId).map(v => v.amount));
        if (!Object.hasOwn(r.charges, event.chargeId) || !amount(event.amount) || event.amount === 0n || refunded + event.amount > charge) throw new Error('INVALID_REFUND');
        r.refunds[event.evidenceId] = { chargeId: event.chargeId, amount: event.amount }; break;
      }
      case 'settle':
        if (!r.started || r.settled || !['completed', 'failed'].includes(r.state) || !amount(event.gross) || event.gross !== sum(Object.values(r.charges))) throw new Error('INCONSISTENT_SETTLEMENT');
        r.settled = true; break;
      default: throw new Error('UNKNOWN_EVENT');
    }
    if ('evidenceId' in event) tx.ledger.evidence[event.evidenceId] = proof;
    tx.ledger.events[event.id] = proof;
    r.version++;
    return structuredClone(r);
  });
}
