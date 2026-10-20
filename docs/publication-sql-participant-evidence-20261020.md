# Publication SQL participant and observation scope — 20 October 2026

**Production HOLD / NO-GO.** Isolated branch `feat/growthos-publication-sql-participant-20261020` descends from `integration/growthos-atomic-publication-20261020` at `624a1c2a0b9c04f506bc269918c5aae180ccb179`. Candidate 010 `bb10b32ec0186399ae10b1820541d4330aab500843cd0fcf2a82b4da515c2c5b`, 011 `7b9f5b15d2797c13bc6c30d04a08d49b5112a2545f264b543e86ffd5b303362a`, proposed 012 `6d32ff6a950e9e90c40a4c5e5892c783914847c0f518faab980f08764bc310a6` and 013 `049f16c9c9eb9336c60b9d3ebf42d5f66763257146d4d99714b0f74e7aea481e` were reviewed and left unchanged. Migrations 001–012, certified backup/recovery and installers are untouched.

## Scope resolution

Candidate 013's job-event observation FK pins only `(organization_id,issuer,event_id,payload_hash)`. It cannot enforce that a signed observation belongs to the same website, content and channel as the job; its observation row also has no destination ID. **Unregistered review-only candidate 014** (`database/proposals/publication-observation-scope-v1/014_observation_scope_candidate.sql`, SHA-256 `d341bb3bc004b332f7cbc8253c2e5eb5255a4b8120860ae5d453f87762ee71b8`) adds two composite parent keys, four nullable event identity columns, two composite FKs with 14 columns total, and a reconciliation-only non-null CHECK. The event's job FK binds destination and claim hash; the observation FK binds organization, website, content and channel. Application verification must still validate both signed observation and signed destination binding, current issuer/key revocation, freshness, and the canonical claim. `verifyScopedPublicationObservation` requires an explicit trusted verifier; it compares all scope, destination, claim, issuer and returned signed payload identities. No unsigned connector configuration counts as evidence. No production verifier or reconciler was registered.

The proposal assumes a fresh empty disposable schema and exact installed 010–013. ALTER statements commit implicitly; a partial installation must be discarded. No ledger entry was inserted, no candidate SQL was installed, and the existing 013 verifier was not changed. The previous planned 34 tables/42 triggers/155 FK columns/13 ledger entries remains **only a proposal**. If 014 were approved and installed separately, the *planned* FK column count becomes 169 and ledger entries 14; actual MariaDB metadata is unobserved. Collation, ENUM/FK compatibility, index width, old-row backfill and CHECK behavior need live certification.

## One-connection SQL participant

`MySQLPublicationSqlParticipants` plugs into `MySQLAtomicPublicationRepository` and performs tenant-scoped locked reads and writes on the supplied connection. It locks portfolio/site/job/content and current policy, requests the existing `MySQLPublicationAuthorization` to verify current session, approver, approved content event, destination, signed connector evidence and independent checkpoint, requires exactly one distinct reserved quota-v2 publication funding record, and requires an explicit budget authority for site-local week, UTC portfolio month and integer ceiling. The same transaction inserts the unique claim with the **legacy generation** ID, moves the **distinct v2 publication** reservation to executing with an immutable quota event, consumes and journals the authorization, inserts the immutable funding binding, appends the content `publication_unknown` event and CAS, checks the authorization audit, and CAS-updates the scheduled job with an independently supplied witness reference and immutable job event. At the commit boundary it rechecks the session, actor and approver membership, connector checkpoint, budget authority and independent fence. It never calls the older store's internal COMMIT, a provider or a worker. An indeterminate COMMIT still enters operator HOLD and allows readback only.

The default `MySQLPublicationAuthorization` lacks the required checkpoint/execution guard, and the new participant lacks any default schema, budget or independent-witness authority. The constructor refuses missing authority methods. This branch does not instantiate it in any route. Factory-managed `_factory` records are explicitly refused pending canonical persisted-record approval/hash reconciliation. A successful mock call is not proof that an independently anchored lease or monthly/weekly accounting exists.

`MySQLPublicationRevisionInvalidator` is a no-pool, no-transaction component for the existing factory `invalidate` callback. With the content row already locked by that factory transaction, it locks claims, bindings, jobs, publication quota reservations and authorizations in a fixed order. Any claimed, executing, consumed, ambiguous or future-version work refuses. It CAS-cancels scheduled jobs, releases only reserved and uncharged v2 funding with an immutable quota cancel event, and revokes unused authorization with an immutable event. Current actor and release policy evidence are explicit authorities; a failed step must roll back the caller's entire content revision transaction. It is **not** installed as a default callback. Two-session lock order, deadlocks and budget accounting remain live gates.

## Executed offline evidence

The scratch checkout was cleared between turns. The source was freshly cloned and pinned; `npm ci --ignore-scripts --no-audit --no-fund` exited 0, installing 58 packages. Runtime was **Node v24.19.0**. `node22`, `docker`, `mariadbd` and `mariadb` were absent on PATH. No database command was run, no real credentials were used, and no SQL was installed. The `/tmp/growthos-010.sql` and `/tmp/growthos-012.sql` inputs were extracted read-only from the pinned source branches and their exact hashes checked above.

| Command | Exit / observed result |
| --- | --- |
| `node --check scripts/verify-publication-observation-scope-candidate.cjs` | 0 PASS |
| `node --check scripts/test-publication-observation-scope-offline.cjs` | 0 PASS |
| `node scripts/verify-publication-observation-scope-candidate.cjs --candidate-010=/tmp/growthos-010.sql --candidate-012=/tmp/growthos-012.sql` | 0 PASS, review-only |
| `node scripts/test-publication-observation-scope-offline.cjs --candidate-010=/tmp/growthos-010.sql --candidate-012=/tmp/growthos-012.sql` | 0 PASS, one positive and seven negative refusals |
| `npm test` | 0 PASS, 449 discovered; 448 pass, 1 skip, 0 fail |
| `npm run typecheck` | 0 PASS |
| `NEXT_TELEMETRY_DISABLED=1 npm run build` | 0 PASS |
| `npm run test:security:offline` | 0 PASS |
| `npm run test:mutation-security:offline` | 0 PASS, 52 assertions |
| `npm run test:auth-cookies:offline` | 0 PASS |
| `npm run test:db-guards:offline` | 0 PASS, eight refusals |
| `node scripts/test-feature-route-mocked.cjs` | 0 PASS |
| `node scripts/test-governance-route-mocked.cjs` | 0 PASS |
| `node scripts/test-growth-engine-db-boundary-mocked.cjs` | 0 PASS |
| `node scripts/verify-publication-funding-proposal.cjs --candidate-010=/tmp/growthos-010.sql --candidate-012=/tmp/growthos-012.sql` | 0 PASS |
| `node scripts/test-publication-funding-proposal-offline.cjs --candidate-010=/tmp/growthos-010.sql --candidate-012=/tmp/growthos-012.sql` | 0 PASS, 12 refusals |
| `node scripts/verify-production-migration-package.cjs` | 0 PASS |
| `node scripts/verify-authorization-trust-proposal.cjs` | 0 PASS |
| `npm run migration:plan` | 0 PASS, plan only |

The three new unit files contribute **10 mock/synthetic cases** covering one-connection ordering, unique claim contention, duplicate funding refusal, rollback, forged tenant/claim/destination, disabled switches, stale content, revoked fence, revision ambiguity and unknown COMMIT. Earlier `npm ci --ignore-scripts --offline` exited **1** because the package tarballs were not cached; the subsequent normal `npm ci` succeeded. An intermediate typecheck exited **2** on new TypeScript nullability, corrected before the final full run. The cleared scratch checkout caused an intermediate offline verifier ENOENT; files were restored from the pinned source, and the final verifier and tests passed. None of these intermediate failures touched a database.

## Remaining independent gates

**BLOCKED:** Node 22 parity; disposable MariaDB 11.8 installation and metadata/index/FK/trigger checks for 010–014; actual two-session serializability, deadlocks, rollback and crash/COMMIT ambiguity; independently durable trust anchor and lease custody; production-grade signed destination-aware observation verifier; actual budget authority and quota settlement; `_factory` canonical hash/approval integration; safely wired revision callback; durable `PublicationJobStore` scheduling/cancel/reconcile on the same transaction; expanded backup/restore contract and authenticated isolated staging. No publishing or automation activation is authorized.
