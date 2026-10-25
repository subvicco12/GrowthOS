# Recommendation revocation, disposable installer and recovery guard — offline evidence

Starting GitHub HEAD `b04b900d611a1b216a4a8da91843292d808ae876` on `feat/growthos-final-product-closure-20261024`. Production HOLD / NO-GO. Runtime Node.js `v24.22.1`, npm `11.9.0`. No MariaDB connection, migration installation, backup, restore or publication occurred.

## Application authority

`reviewRecommendation` now requires `ReviewTransaction.assertCurrentEvidence` inside its existing single-connection transaction, before role/budget checks and event append. The candidate MySQL adapter reads scoped 016 source references, locks the corresponding immutable 015 evidence parent `FOR UPDATE`, compares source and payload hashes, observed/expiry timestamps and tenant/website identity, then requires exactly one authoritative `ingested` event and no `revoked` event. Missing sources, unsupported nonmanual evidence, duplicates, unknown SQL outcomes and stale evidence refuse. Candidate 016's local `evidence_revoked_at` remains an additional guard, never the sole authority. The route is still disabled (503), so no production decision write is exposed.

The lock is intended to serialize a 015 revocation-event INSERT through the parent FK. **Two-session MariaDB verification is required** to establish that ordering under actual isolation and revocation transactions. The current abstract session, membership, budget and switch authorities also need certification through COMMIT. Offline mocks do not meet either gate.

## Disposable installer

`scripts/disposable-candidate-installer.cjs` is separate from the protected 001–009 runner. `--plan` parses seven pinned SQL files with exact statement counts **13, 25, 10, 14, 3, 19, 9**. The guarded `--install-disposable` path requires explicit disposable opt-in, a separately asserted isolation gate, synthetic credentials, numeric loopback, MariaDB 11.8 identity and bind address, distinct sessions, the exact 15-table/four-trigger baseline, nine pinned ledger entries and a fully parsed 010–016 chain. It refuses nonbaseline schemas and has no resume mode. Partial DDL failures identify the test schema for quarantine; operators must start a new empty disposable schema and reinstall the baseline. It checks the proposed 44/60/200/16 inventory afterward. **This install path was not executed or live-certified.** An environment variable asserting isolation does not itself prove an independent network or server boundary; the operator must verify it externally before invocation.

## Recovery boundary

`expanded-review-dump-guard.cjs` is a separately versioned, restricted offline dump-shape checker. It requires an independently trusted full-file SHA-256 digest and a 010–016 manifest, rejects invalid UTF-8, truncated inventory, comments/executable comments, database switching, schema-qualified statements, client directives, unsupported SQL and altered bytes. It returns `restoreAuthorized:false`. `verify-review-recovery-manifest-offline.cjs` additionally checks synthetic tenant-scoped evidence/event and recommendation/decision links, duplicate IDs and revoked-source acceptance. No populated dump or restore was exercised. A live dump generator, independently pinned manifest custody, byte-exact validator coverage for real MariaDB output and restoration harness still require separate certification.

## Executed commands

| Command | Exit | Evidence |
| --- | ---: | --- |
| `node --import=tsx --test src/core/__tests__/growth-opportunity-review.test.ts src/core/__tests__/mysql-recommendation-review-mocked.test.ts` | 0 | 9 targeted tests passed |
| `node scripts/test-disposable-candidate-installer-offline.cjs` | 0 | Parser and install refusal passed |
| `node scripts/test-expanded-review-dump-guard-offline.cjs` | 0 | Unsafe/corrupt/truncated dump refusals passed |
| `node scripts/test-review-recovery-manifest-offline.cjs` | 0 | Manifest and revocation-history refusals passed |
| `node scripts/test-review-migration-chain-offline.cjs` | 0 | Seven pinned candidates passed static checks |
| `node scripts/disposable-candidate-installer.cjs --plan` | 0 | Seven parsed statement counts |
| `node scripts/disposable-candidate-installer.cjs --install-disposable` | 2 | Expected refusal: install authorization absent; no connection |
| `npm test` | 0 | 524 tests: 523 passed, one skipped |
| `npm run typecheck` | 0 | Passed |
| `npm run test:security:offline` | 0 | Passed |
| `npm run test:auth-and-session:offline` | 0 | Passed |
| `npm run test:mutation-security:offline` | 0 | 52 assertions passed |
| `npm run test:db-guards:offline` | 0 | Eight refusals passed |
| `NEXT_TELEMETRY_DISABLED=1 CIRCLE_NODE_TOTAL=2 npm run build` | 0 | Capped build passed |

Remaining release gates: Node 22 parity; independently isolated MariaDB 11.8, two-session FK/revocation race and candidate 010–016 installation; exact FK/collation/trigger/grant checks; populated expanded backup/restore with corruption and partial-install recovery; independent issuer/fencing/budget authorities and authenticated staging. Do not interpret this offline preparation as production authorization. Production remains HOLD / NO-GO.
