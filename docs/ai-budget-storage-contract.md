# AI budget storage integration contract

Status: design only; no production database or provider is connected.

## Non-negotiable behavior

- New websites default to zero weekly generation, zero monthly spend, and disabled automation.
- All requests must be authenticated and scoped to the active organization and website.
- Persist idempotency keys and prevent duplicate charges from retries.
- Reserve weekly units, per-site spending, and organization spending in one atomic database transaction.
- Serialize concurrent reservations using database locks or equivalent isolation; never use browser counters as enforcement.
- Reconcile actual provider charges and unused reservations, preserving an append-only audit trail.
- Reject tasks when limits are missing, exceeded, or the database is unavailable.
- Do not publish content or call billable providers until the reservation succeeds.
- Prevent rollover of unused weekly quotas; use a documented timezone and reset schedule.
- Enforce an emergency stop across all websites.

## Release gate

Do not enable production AI jobs until concurrency, retry, rollback, authorization, and billing-variance tests pass. This is unrelated to deferred SaaS subscriptions.
