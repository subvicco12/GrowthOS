# GrowthOS plan and usage authority — offline development evidence

Production remains **HOLD / NO-GO**. This package is not wired to public routes, workers, payments or publication. Candidate 015 is not installed or registered.

## Implemented contracts

- `MySQLPlanAssignments` offers first issuance, revision-CAS replacement, irreversible revocation and tenant-scoped read. It checks an authenticated current owner/admin membership under a transaction and requires a separate `plan-issuer` capability with an independent organization lease. Assignment and append-only event commit together. Unknown COMMIT returns `PLAN_COMMIT_UNKNOWN`; callers must inspect state before any retry. No production issuer exists.
- `MySQLPlanUsage` reserves only bounded **zero-cost, non-publication** units. It requires a server-owned feature policy, current trusted plan verifier under an independent organization lease held through COMMIT, active membership and website, an unpaused organization budget row, a finite quota and a current assignment. The organization-level UTC month is separate from site-local quota-v2 weeks and publication funding.
- Usage reserve, settle, cancel and full refund update counters, status and append-only transitions in one supplied SQL transaction. A reserved unit cannot be charged twice. Settled units may be refunded once; cancelled units cannot settle. Compensation after expiry or revocation requires separate authority. Feature shutdown and current plan revision are rechecked before settlement. Paid cost is refused before SQL.
- A read-only lookup by organization, website, feature and idempotency key supports operator recovery after an unknown reservation COMMIT. No automatic redispatch occurs.
- Candidate 015 was amended in place **only while still review-only**: usage events now bind a website; assignment/usage audit rows record the actor; full refund is a terminal state; triggers block terminal resets, identity changes, deletion and assignment unrevocation. Existing migrations 001–014 are untouched. Candidate 015 requires independent MariaDB syntax, FK, collation, grants, two-session and backup certification before acceptance.

## Offline versus live evidence

The `node:test` persistence fakes exercise statement order, rollback branches, CAS refusals, quota contention under a synthetic lease, replay and unknown COMMIT responses. They do **not** establish InnoDB atomicity or trust-anchor durability. `scripts/certify-plan-usage-two-session.mjs` is a separate future disposable-only probe. It rejects missing opt-in, non-loopback host, non-test schema, non-synthetic credentials and absent candidate tables before modifying anything. It does not install a migration or turn on automation. A real run additionally requires independent verification that the server and credentials are disposable; this Work environment has no MariaDB 11.8.

## Required next gates

1. Independently review candidate 015 numbering and dependencies alongside 010–014; validate its 7 tables, 12 triggers, indexes, FKs, charset/collation, least-privilege grants and changed backup inventory in isolated MariaDB 11.8.
2. Provide independently trusted, durable issuer/key custody and one monotonic organization lease shared by plan issuance and usage. Synthetic capability objects must never be production authority.
3. Certify real two-session assignment CAS and last-slot contention, rollback and unknown COMMIT recovery; certify signed issuer revocation and role changes under contention.
4. Reconcile organization plan quotas with site-local quota-v2 and portfolio monetary budgets. Billable reservation, paid entitlement activation, partial refunds and publication funding remain disabled.
5. Run Node 22 parity and authenticated isolated staging before release approval.
