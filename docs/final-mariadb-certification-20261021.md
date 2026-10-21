# Final publication MariaDB certification gate — 21 October 2026

**Production: HOLD / NO-GO.** This branch starts from GitHub source `integration/growthos-final-publication-20261021` at `81e4b93bb79a5bcff355e06291d20fe1009c4b5a`. The local checkout used for the edits had the identical tree `41c1925df60d931df6b028638e80b69f0bf24cca` under a local equivalent commit. The source preserves the durable-completion ancestry (`a40bfe6d42106d4b824a4c54633dac01c2c45a51`). The reference recovery branch `ae534f637c17886b4513dc935db99969561787d1` was read only.

## Executed evidence

Environment: Node `v24.19.0`; Node 22, `mariadbd`, `mariadb`, `mariadb-dump`, Docker and Podman unavailable. No database credentials or server isolation could be verified. No SQL connection, candidate migration installation, restore, two-session test, provider dispatch or publication occurred. The preflight always refuses to authorize SQL, even if executable versions match.

| Command | Exit | Result |
| --- | ---: | --- |
| `node --check scripts/certify-final-publication-preflight.cjs` | 0 | PASS syntax, Node 24 only |
| `node --check scripts/test-final-publication-preflight-offline.cjs` | 0 | PASS syntax |
| `node scripts/test-final-publication-preflight-offline.cjs` | 0 | PASS, 8 refusal cases; matching versions cannot authorize SQL |
| `node scripts/certify-final-publication-preflight.cjs --candidate-010=/tmp/growthos-cert-final-010.sql --candidate-012=/tmp/growthos-cert-final-012.sql --source-schema=growthos_test_source --destination-schema=growthos_test_restored --host=127.0.0.1` | 2 | BLOCKED_RUNTIME; no SQL authorized |
| `node scripts/verify-production-migration-package.cjs` | 0 | PASS static certified baseline package |
| `node scripts/verify-authorization-trust-proposal.cjs` | 0 | PASS static 011 review contract |
| `node scripts/verify-publication-funding-proposal.cjs --candidate-010=/tmp/growthos-cert-final-010.sql --candidate-012=/tmp/growthos-cert-final-012.sql` | 0 | PASS static 013 review contract, no execution |
| `node scripts/verify-publication-observation-scope-candidate.cjs --candidate-010=/tmp/growthos-cert-final-010.sql --candidate-012=/tmp/growthos-cert-final-012.sql` | 0 | PASS static 014 review contract, no execution |
| `npm test` | 0 | PASS 467, FAIL 0, SKIP 1 of 468 discovered; Node 24 |
| `npm run typecheck` | 0 | PASS, Node 24 |
| `CIRCLE_NODE_TOTAL=2 NEXT_TELEMETRY_DISABLED=1 npm run build` | 0 | PASS clean capped production build, Node 24. Uncapped build was not rerun; earlier `ENOTEMPTY` remains unclosed. |
| `npm run test:security:offline` | 0 | PASS static checks |
| `npm run test:db-guards:offline` | 0 | PASS 8 refusal cases |
| `npm run test:auth-cookies:offline` | 0 | PASS route mocks |
| `npm run test:mutation-security:offline` | 0 | PASS 52 assertions |
| `node scripts/test-production-migration-package-negative.cjs` | 0 | PASS baseline tamper refusal |
| `node scripts/test-production-migration-executor-offline.cjs` | 0 | PASS manifest and 8 refusals |

The read-only candidate 010 and 012 files were extracted from the pinned certification branches with `git show` into `/tmp`, never installed. SHA-256 pins checked by preflight: 010 `bb10b32ec0186399ae10b1820541d4330aab500843cd0fcf2a82b4da515c2c5b`; 011 `7b9f5b15d2797c13bc6c30d04a08d49b5112a2545f264b543e86ffd5b303362a`; 012 `6d32ff6a950e9e90c40a4c5e5892c783914847c0f518faab980f08764bc310a6`; 013 `049f16c9c9eb9336c60b9d3ebf42d5f66763257146d4d99714b0f74e7aea481e`; 014 `d341bb3bc004b332f7cbc8253c2e5eb5255a4b8120860ae5d453f87762ee71b8`. Static pins and declared FK/index/trigger inventory are not MariaDB compatibility certification. Certified migrations 001–009 and all recovery packages remain unchanged.

## Reproducible live gate in a future isolated environment

Provision Node 22, MariaDB 11.8 server/client/dump, and a disposable process or container with local-only networking. Independently verify process identity, TCP/socket binding, absence of inherited client defaults, synthetic-only credentials, new empty distinct `growthos_test_*` source/destination schemas, and no production route or credentials. Review candidate 010–014 dependency order, exact SQL/hashes and recovery-v4 inventory **before** any installation. The preflight reports requirements and refuses; it is deliberately not a migration runner. No approved live executor or environment is furnished by this branch.

With separate authorization after isolation review, use the existing guarded disposable runner and proposed review packages to establish 001–014, then test two independent SQL sessions: scoped organization/website/content/claim identity, distinct publication reservation, simultaneous last-slot contention, duplicate claim, optimistic CAS, approval consumption, revocation/fencing races, deadlock and rollback, unknown COMMIT readback without retry, immutable audit, and minimum grants. Populate synthetic data and use the separately versioned recovery-v4 contract to verify 34 tables, 42 triggers, 169 FK columns, 14 ledger entries, deterministic per-table hashes, corruption refusal, wrong/dirty destination refusal, interrupted restore and retry refusal. These are **all BLOCKED**, not simulated PASS.

## Application and authority boundary

The current integration's one-connection transaction and uncertain-COMMIT operator HOLD are covered by mocked tests, not independent MariaDB sessions. The job-store cancellation path still refuses pending in-transaction revision invalidation. Production session/membership/approver authority, independent monotonic fencing, signed connector issuer/revocation and destination evidence, quota-v2/budget authority, candidate 014 installed metadata and recovery-v4 compatibility remain unimplemented or uncertified. No mock can stand in for these authorities. Publishing, workers and automation remain disabled. An independent candidate review, genuine Node 22 and MariaDB certification, restore rehearsal, authenticated synthetic staging and explicit release approval are required before changing HOLD / NO-GO.
