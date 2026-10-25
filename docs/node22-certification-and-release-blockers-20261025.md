# GrowthOS Node 22 parity and release blockers — 25 October 2026

Branch `feat/growthos-final-product-closure-20261024`; starting GitHub HEAD `9addc0d3bd2385eaea859c41bbee64b3248991f5`. Production HOLD / NO-GO.

## Environment and isolation decision

This Work runtime had Node `v24.22.1`, npm `11.9.0`, about 30 GiB free disk and 9.2 GiB available memory. No `mariadbd`, `mariadb`, `docker` or `podman` command was available. A clean checkout of the authorized branch was obtained. Node `v22.23.4` was installed under `/tmp/growthos-node22` from npm without changing the system runtime; `npm ci` installed repository lockfile dependencies. No MariaDB process or disposable container was created. No database connection was attempted.

An application environment flag claiming isolation is insufficient evidence of the actual server process or network boundary. The candidate installer now refuses even a fully populated synthetic opt-in with `INDEPENDENT_SERVER_ISOLATION_GATE_UNAVAILABLE` before loading mysql2 or opening a connection. A future independently reviewed process/network attestation, plus separate installation authorization, is required before enabling that path. The guarded candidate SQL and protected migrations are unchanged.

## Confirmed Node 22 defect

The first `npm test` run exited 1: 522 passed, one skipped, one cancelled. The cancellation was `offline-website-discovery.test.ts` with `ERR_TEST_FAILURE: Promise resolution is still pending but the event loop has already resolved`. Node 22's `AbortSignal.timeout` did not keep the loop alive while the synthetic transport deliberately remained unresolved. `offline-website-discovery.ts` now uses a bounded timer that is cleared in a `finally` block. The targeted test passed 3/3, and the full rerun passed 523/524 with one existing skip. No live crawler or transport was added.

## Executed Node 22 commands

All commands below used `PATH=/tmp/growthos-node22/node_modules/.bin:$PATH`.

| Command | Exit | Result |
| --- | ---: | --- |
| `node -v`; `npm -v` | 0 each | `v22.23.4`; `11.9.0` |
| `npm ci --no-audit --no-fund` | 0 | Lockfile install, 58 packages |
| `npm test` (before fix) | 1 | 522 passed, 1 skipped, 1 cancelled; no assertion failures |
| `node --import=tsx --test src/core/__tests__/offline-website-discovery.test.ts` | 0 | 3 passed after fix |
| `npm test` (after fix) | 0 | 524 total: 523 passed, 1 skipped, 0 failed/cancelled |
| `npm run typecheck` | 0 | Passed after fix |
| `npm run test:security:offline` | 0 | Passed |
| `npm run test:auth-and-session:offline` | 0 | Passed |
| `npm run test:mutation-security:offline` | 0 | 52 assertions passed |
| `npm run test:db-guards:offline` | 0 | Eight refusals passed |
| `node scripts/test-review-migration-chain-offline.cjs` | 0 | Seven pinned candidates; static only |
| `node scripts/test-disposable-candidate-installer-offline.cjs` | 0 | Parser counts and refusal cases, including independent-isolation refusal after fix |
| `node scripts/test-review-recovery-manifest-offline.cjs` | 0 | Static manifest/history refusals |
| `node scripts/test-expanded-review-dump-guard-offline.cjs` | 0 | Restricted dump-shape refusals |
| `node scripts/disposable-candidate-installer.cjs --plan` | 0 | 010–016 statement counts 13, 25, 10, 14, 3, 19, 9 |
| `node scripts/disposable-candidate-installer.cjs --install-disposable` | 2 | Expected authorization refusal, no connection |
| `NEXT_TELEMETRY_DISABLED=1 CIRCLE_NODE_TOTAL=2 npm run build` | 0 | Capped Next.js build passed after fix |

## Remaining certification gates

| Gate | Classification | Exact next requirement |
| --- | --- | --- |
| Node 22 offline parity | PASS | Preserve this runtime/version evidence for the eventual release candidate |
| MariaDB 11.8 migration 001–016, 44 tables/60 triggers/200 FK columns/16 ledger entries | BLOCKED | New independently isolated server and schemas, process/network identity, synthetic credentials, separate install authorization |
| Revocation versus recommendation review | BLOCKED | Two independent sessions; test parent FK lock ordering, revocation-first/review-first, rollback, membership revocation and unknown COMMIT |
| Expanded populated backup/restore | BLOCKED | Independently pinned real dump, trusted manifest custody, empty second schema, referential/content/trigger checks and corruption refusals |
| Least-privilege grants and immutable journals | BLOCKED | Real SQL principals and two-session negative tests |
| Authenticated staging | BLOCKED | Existing `staging/` harness requires Docker/Compose, MariaDB 11.8, isolated HTTPS proxy and synthetic two-organization fixture |

## Authority and staging assessment

Session verification and organization membership are implemented in `src/server/organization-context.ts` and MySQL adapters, with offline route tests. The recommendation GET/POST route remains 503 pending candidate 016 and current authority certification. Plan assignment requires a separately trusted issuer (`mysql-plan-assignments.ts`); connector health requires a signed issuer and an `IndependentTrustAnchor` outside database rollback (`connector-trust.ts`). Publication issuance route passes `null` authority and remains disabled. Baseline website automation and auto-publish default false; organization budgets default globally paused. These are source observations, not live authority certification.

The existing `staging/fixture.mjs` defines two synthetic organizations, two websites and owner/admin/viewer identities. `staging/e2e.mjs` and the isolated proxy contract are prepared but not executed in this runtime. The future staging run must cover switching, cross-tenant refusal, evidence/decision history, feature and budget denial, session expiry, unknown-COMMIT HOLD and responsive Android/tablet behavior. No real-device certification occurred.

No migrations were installed. No backup/restore, two-session race or authenticated staging test was run. Production remains HOLD / NO-GO pending independent authorities, MariaDB/recovery certification and explicit release approval.
