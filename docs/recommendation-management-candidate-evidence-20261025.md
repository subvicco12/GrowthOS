# GrowthOS recommendation management — offline candidate evidence

**Branch base:** `feat/growthos-final-product-closure-20261024` at GitHub `3ef9b39aa99296ab5f408e8331b07e3f2c3e1056`. **Production HOLD / NO-GO.** Runtime Node.js `v24.22.1`, npm `11.9.0`. No MariaDB connection or migration execution occurred.

## Review-only persistence proposal

Candidate `database/proposals/recommendation-review-v1/016_recommendation_review_candidate.sql` follows existing 001–009 and separately proposed 010–015. It is not registered for installation. SHA-256: `a2017e1daab3a27d37436ed8e45853e9bbb9ed5ec9d8ef0e480f1395f274377b`.

Inventory: three InnoDB tables (`growth_recommendations`, `growth_recommendation_evidence`, `growth_recommendation_review_events`), six triggers, five foreign keys comprising 12 FK columns, three primary keys, three named unique keys and five secondary indexes. UUID columns inherit database collation for composite FK compatibility; hashes and idempotency keys use binary ASCII comparison. Dependencies include `growth_websites`, `growth_users` and the review-only 015 `growth_intelligence_evidence` table. Exact SQL syntax, collation, index width, FK behavior, CHECK enforcement, trigger semantics and grants **have not been certified in MariaDB 11.8**.

The state guard requires a matching review event for the proposed revision before a state update; evidence and decision journals reject UPDATE and DELETE. The only review transition implemented in application logic is `proposed` → accepted for planning, rejected or deferred. Expiry/revocation events require a separately reviewed authority path. Direct table privileges must be split: read-only projection principal can SELECT scoped records; review transaction principal needs only SELECT, INSERT on review events and UPDATE of recommendation state/revision; candidate installation principal alone has DDL. No runtime DELETE, DDL, publishing, job or payment privilege. Application tenant and membership checks remain mandatory because SQL grants alone do not implement row-level tenancy. Two-session grants and revocation races remain untested.

If 010–016 all pass independent review, the **proposed**, not observed, recovery inventory grows from 41 to 44 tables, 54 to 60 triggers, 188 to 200 FK columns and 15 to 16 ledger entries. A separately versioned backup validator needs the exact 016 hash, names, indexes, trigger definitions, per-table deterministic hashes, immutable event checks and refusal of partial restore. The existing certified recovery package was not changed.

## Application boundary

- The `MySQLRecommendationReviewStore` candidate takes one connection for lock, idempotency lookup, event INSERT, state CAS and COMMIT. A definite failure rolls back. An indeterminate COMMIT returns operator HOLD without retry. The event is inserted before CAS so the candidate trigger can require it; failed CAS must roll back the entire transaction.
- The review service derives decision time from a mandatory server authority and rechecks evidence hash, expiry, current role/membership, budget and feature switches under the transaction contract. Evidence revocation in the candidate row is refused. The store is **not instantiated by any route**, and the current authority implementation is not production-certified.
- `GET`/`POST /api/organization-recommendations` authenticate session/organization, reject mismatched organization, constrain decisions, require owner/admin for mutation, enforce canonical Origin/Host and bounded JSON, then return `REVIEW_PERSISTENCE_UNAVAILABLE` (503). No database writer is called. The first-party intelligence panel can check this availability and reports unavailable review history/decisions without inventing success.

## Executed checks

| Command | Exit | Result |
| --- | ---: | --- |
| `npm test` | 0 | 519 tests: 518 passed, one skipped |
| `npm run typecheck` | 0 | Passed |
| `npm run test:security:offline` | 0 | Passed |
| `npm run test:auth-and-session:offline` | 0 | Passed |
| `npm run test:mutation-security:offline` | 0 | 52 assertions passed |
| `npm run test:db-guards:offline` | 0 | Eight refusal cases passed |
| `node scripts/test-recommendation-route-mocked.cjs` | 0 | 12 mocked route assertions |
| `node scripts/verify-recommendation-review-candidate-offline.cjs` | 0 | Exact hash/inventory and mutation refusal; no DB |
| `node scripts/verify-recommendation-review-candidate-offline.cjs --install` | 2 | Expected `NO_ARGUMENTS_ALLOWED` refusal; no DB |
| `NEXT_TELEMETRY_DISABLED=1 CIRCLE_NODE_TOTAL=2 npm run build` | 0 | Capped Next.js production build passed |

Mocked SQL checks covered one connection, event/CAS ordering, rollback, revoked evidence, unavailable clock and unknown COMMIT. They do not certify InnoDB atomicity. A real MariaDB two-session test must verify concurrent decisions, unique idempotency, orphan-event rollback, state trigger, FK/collation, least-privilege grants, interrupted transaction recovery and populated backup/restore. The independent session, evidence revocation, budget and feature authority must be held valid through COMMIT. Node 22 parity and authenticated staging remain release gates.
