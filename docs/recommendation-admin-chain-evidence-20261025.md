# Recommendation admin and review-only candidate chain

Branch `feat/growthos-final-product-closure-20261024`, starting GitHub commit `9385d508b971145fef5a589d62344902dfc8fa98`. **Production HOLD / NO-GO.** Node.js `v24.22.1`; this is provisional offline evidence, not Node 22 or MariaDB certification.

## Executable application work

- A separate first-party recommendation view provides website selection, category/state filters, page-bounded cursor loading, priority, provenance, expiry/revocation labels, details, source references and decision history. It refuses mixed organization/website pages, duplicate IDs, repeated cursors and pages over the local limit. Touch controls and narrow layouts are responsive. The actual GET route still returns 503 pending certified persistence, so the live screen presents unavailability rather than invented records.
- Decision reason and accept/reject/defer controls are visibly disabled. The POST route still validates session, role, tenant, origin and bounded JSON before returning 503. No reviewer, publisher, budget or database authority was fabricated.
- The pure review service now refuses malformed evidence expiry and the terminal unsigned 32-bit revision before append/CAS. Synthetic tests cover both.

## Candidate-chain inventory and review decisions

`scripts/verify-review-migration-chain-offline.cjs` is read-only and pins the exact available candidate hashes. It rejects mutation and all command-line arguments. It does not execute SQL or certify grammar. Candidate 014 is ALTER-only, preserving candidate 013; it has no standalone InnoDB table. The 010 and 012 SQL sources are **absent from this branch checkout**, so a complete 010–016 chain cannot be proven here. The five present files comprise 21 candidate tables and 42 triggers, excluding 010/012 and the 014 alterations. Existing 001–009 and all candidate SQL remain unchanged.

| Number | SHA-256 in this checkout | Scope |
| --- | --- | --- |
| 010 | unavailable | Required content persistence; source must be independently obtained and pinned |
| 011 | `7b9f5b15d2797c13bc6c30d04a08d49b5112a2545f264b543e86ffd5b303362a` | Authorization/trust |
| 012 | unavailable | Required quota-v2 persistence; source must be independently obtained and pinned |
| 013 | `049f16c9c9eb9336c60b9d3ebf42d5f66763257146d4d99714b0f74e7aea481e` | Funding/jobs |
| 014 | `d341bb3bc004b332f7cbc8253c2e5eb5255a4b8120860ae5d453f87762ee71b8` | Observation scope amendment |
| 015 | `50dc53b228a391bfe221cf92e7c855fedfb39c1ced1ed452da1aa56b96446551` | Product authority/evidence |
| 016 | `a2017e1daab3a27d37436ed8e45853e9bbb9ed5ec9d8ef0e480f1395f274377b` | Recommendation review |

Candidate 016 references 015's immutable `growth_intelligence_evidence`, but the recommendation's own `evidence_revoked_at` field does not automatically follow a revocation event in `growth_intelligence_evidence_events`. A trusted, transactional revocation propagation or current-evidence authority is required before the read/write path is bound. Current `ReviewAuthority` is abstract and cannot hold session, budget, evidence and feature authority through COMMIT. MariaDB FK/collation, trigger timing, CHECK behavior, indexing, grants, partial install and expanded backup/recovery remain unverified. Do not register or install candidates until independent review and a disposable MariaDB 11.8 two-session run.

## Executed checks

| Command | Exit | Result |
| --- | ---: | --- |
| `node --import=tsx --test src/core/__tests__/growth-opportunity-review.test.ts src/core/__tests__/recommendation-review-projection.test.ts src/core/__tests__/recommendation-review-admin.test.ts` | 0 | Eight targeted tests passed |
| `npm test` | 0 | 523 tests; 522 passed, one skipped |
| `npm run typecheck` | 0 | Passed |
| `npm run test:security:offline` | 0 | Passed |
| `npm run test:auth-and-session:offline` | 0 | Passed |
| `npm run test:mutation-security:offline` | 0 | 52 offline assertions passed |
| `npm run test:db-guards:offline` | 0 | Eight guard refusals passed |
| `node scripts/test-recommendation-route-mocked.cjs` | 0 | 12 mocked route assertions passed |
| `node scripts/test-review-migration-chain-offline.cjs` | 0 | Hash, missing-source and mutation checks passed |
| `node scripts/verify-review-migration-chain-offline.cjs --install` | 2 | Expected argument refusal; no database access |
| `NEXT_TELEMETRY_DISABLED=1 CIRCLE_NODE_TOTAL=2 npm run build` | 0 | Capped production build passed under Node 24 |

No live database, authenticated staging, browser device, Node 22, production service, CI, provider or publishing test was executed. Next: recover and independently hash 010/012, reconcile 016 revocation and projection authority, certify the full chain and expanded recovery on an isolated disposable MariaDB 11.8 with two sessions, then connect the route only after grants and current authorities pass. Keep production HOLD / NO-GO.
