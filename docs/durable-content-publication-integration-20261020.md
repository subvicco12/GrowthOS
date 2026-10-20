# Durable content and publication integration — 20 October 2026

**Production HOLD / NO-GO.** No SQL migration was installed; no publisher, worker, network provider or scheduled automation was enabled.

Implementation commit: `d0da2d31f96697c9848ec8a3d08562fc7f51dbc2` (tree `9de8ee7f6f0c74b4444f5f41a8e8a8b08185df22`). This documentation is committed separately to the same isolated integration branch.

Changed implementation files: `src/core/content-factory.ts`, `src/core/content-lifecycle.ts`, `src/core/safe-publication-jobs.ts`, `src/core/publication-atomic-integration.ts`, `src/server/mysql-content-factory-store.ts`, `src/server/mysql-content-store.ts`, `src/server/mysql-publication-authorization.ts`, `src/server/mysql-publication-claim-store.ts`, and two new tests, `src/core/__tests__/mysql-content-factory-adapter.test.ts` and `src/core/__tests__/publication-atomic-integration.test.ts`. No database, migration, backup, recovery, trust-anchor, quota settlement, staging, provider configuration, workflow or source-branch file changed.

## Verified inputs and lineage

Primary `feat/growthos-content-provider-completion-20261020` at `2096d74a415391560ca2a8aaa22a2fade1f924c0`. Read-only remote refs matched `feat/growthos-authorization-trust-20261019` at `8b0e2d9eb52eb184eb9ecc5ba5b2521eb0acf71d`, `certification/growthos-unified-schema-review-20261020` at `6554be9e6fb8cdb7742f8abf8a637cf0aa9384df`, and `feat/growthos-quota-settlement-20261019` at `bd4d08c36b4c2c0d2a909d42377be048e9779d47`. Primary descends directly from authorization/trust; its merge base with unified review is that authorization/trust commit, and its merge base with quota is `ae1ccce603f7080c44e0c2025b00ce62105e8888`. Source branches were not merged or edited. The uploaded Blueprint (SHA-256 `1a04e0a2afae7545740948aeaadb876c0f972f5ae7720128ec2b662354ce8a92`), `docs/content-provider-integration-contract-20261020.md`, unified recovery design, candidate 010/011 and quota-v2 012 were inspected.

## What fits the existing candidate 010

`MySQLContentFactoryStore` uses `growth_content_records.record_json` and `growth_content_events.record_json` from candidate 010. Its optional `_factory` member stores the brief, source receipts, QA report, human consent and command journal in the same versioned JSON snapshot as `ContentRecord`. Candidate 010 permits these JSON members, `event_kind VARCHAR(40)` permits `brief` and `revise`, and its unique `(organization_id,website_id,content_id,version)` and primary event identity support one event per version. The row scope/version/stage checks still apply. Each mutation locks the scoped row, appends a scoped event, performs a version CAS, and commits together. It refuses migration from nonempty legacy content with no factory metadata, corrupted journal/approval digest, scope mismatch, replay and absent trusted authorities. Its first factory research event can adopt an empty `proposed` version-zero legacy record. The approver's reviewed digest becomes an explicit versioned record field; revision clears it and requires atomic invalidation of all linked unclaimed work.

The adapter requires an explicitly supplied pool and four server authorities: locked regulated/disclosure policy, signed source/QA verification, same-transaction authorization/job/funding invalidation, and current original-approver verification. It re-reads actual session, user, organization membership, website and policy at the commit boundary. A missing authority prevents construction; a failed authority rolls back. The application must supply an actual tenant-safe, separately reviewed implementation of every callback and verify its lock order. The mock tests do **not** certify those callbacks, SQL CHECK/trigger behavior, MariaDB isolation or deployment suitability. The current source does not instantiate this adapter in a route. Existing `MySQLContentStore.update` refuses factory-managed records so an old event writer cannot silently erase or desynchronize factory metadata.

Candidate 010's immutable event triggers protect history but do not prove the mutable JSON metadata equals all earlier events. The adapter validates prefix identities and stores full snapshots; live MariaDB tests and a recovery validator that verifies the entire chain are still required. `contentAuthorizationHash` continues to hash the full stored record, including `_factory`; the in-memory `FactoryEnvelope.record` has no storage member, so its local hash is not interchangeable with a hash read from SQL. Publication of factory records is explicitly blocked until a reviewed canonical persisted-record hash and authorization bridge agree on this representation.

## Publication persistence and transaction decision

There is **no reviewed durable publication job table** in candidates 010, 011 or 012. No existing record, claim or quota JSON column can safely serve as a mutable job row with separate version, destination, probe history and monotonic CAS: editing `growth_content_records.record_json` at a fixed content version breaks its full-record authorization hash, while editing immutable claim/observation/financial journals violates their guards. `SafePublicationWorkflow` therefore retains its unavailable default store. This branch allocates no table name, migration number, installer entry or SQL grant for jobs.

The new `PublicationAtomicCoordinator` defines one transaction participant interface. It acquires an independent fence *before* opening the repository transaction, locks the portfolio/site/content in the reviewed order, checks the exact scheduled record and full content hash, freshly verifies membership, approval, destination, policy, connector and funding, then calls the same transaction's one-time claim insert, quota-v2 funding start, authorization consumption, content `publication_unknown` transition, audit append and job update. The transaction must recheck authority and fence at the actual commit boundary. Its result is a local ambiguous intent, never a provider dispatch. Unknown commit results receive exact-identity **readback only**, then operator HOLD even if the readback appears absent. The synthetic tests exercise sequencing, contention and rollback; there is no MariaDB implementation of this interface.

Candidate 010 `growth_publication_claims.reservation_id CHAR(36)` has an FK to `growth_ai_reservations`; candidate 011 `growth_content_authorizations.reservation_id CHAR(36)` has the same legacy FK. The separately proposed 012 `growth_quota_reservations_v2.id VARCHAR(128)` is scoped by `(organization_id,website_id,id)` and distinguishes `operation='publication'`. Thus a legacy completed generation reservation cannot serve as quota-v2 publication funding. This is an **incompatible schema identity**, not a type cast. A separately certified additive publication-funding binding and exact reference/uniqueness/grant design are needed; 010/011/012 remain unchanged. The old `MySQLPublicationClaimStore.claimOnce` commits internally and cannot be nested into the job/funding transaction. The old authorization and claim paths now refuse `_factory` records (including old reconciliation), preserving existing nonfactory behavior. No external call is possible through the new coordinator.

For unknown provider outcomes, the existing `SafePublicationWorkflow` keeps its claim and retries only explicit status probes. The coordinator never dispatches. A future adapter must append signed destination-bound observations with replay refusal and atomically update the claim/content/job; absent and unknown cannot be converted into a fresh publish attempt. Restored or interrupted rows remain on operator HOLD until the independent anchor, provider issuer, transaction and recovery validators agree.

## Certification boundaries and next gates

1. Review the candidate-010 `_factory` JSON profile, versioned full-record hashing and replay consistency with the 010/011 authorizer, triggers, backup validator and restored event chain. Certify an actual MariaDB 11.8 installation in a disposable schema only; Node 22 parity remains required.
2. Provide trusted, separately permissioned source/QA policy and approver authorities; verify signed provenance, current revocation and lock ordering. Certify atomic invalidation of unclaimed job/authorization/unused funding before allowing revision/cancellation. A claimed or ambiguous record must refuse changes.
3. Review a distinct durable job identity and additive schema/restore/grant contract; resolve the legacy reservation FK against v2 publication funding without changing frozen migrations. Certify actual two-session duplicate claim, budget exhaustion, deadlock/rollback, unknown commit and replay.
4. Supply independent rollback-resistant trust anchor, nonescaping fence/lease protocol and signed connector issuer status. Certify lease loss just before COMMIT, grant separation, stale issuer evidence and recovery after crashes. An ordinary SQL transaction mock is not this proof.
5. Implement one real unified SQL transaction and destination-bound provider reconciliation, then run authenticated isolated staging with disabled provider and automation switches. Require independent release approval after all release gates; production remains HOLD / NO-GO.

Commands, exact exit codes and counts are in `docs/durable-content-test-results-20261020.json`. No Node 22/MariaDB live or authenticated staging certification is claimed.

## Executed results

The runtime was Node `v24.19.0`. `node22`, `docker`, `mariadbd` and `mariadb` were not available on PATH. No local database was started or contacted. The two new test files contribute **11 synthetic/mock cases**. These simulate serializable rollback and contention and are deliberately not evidence of InnoDB behavior.

| Command | Exit | Actual result |
| --- | ---: | --- |
| `npm test` | 0 | 431 discovered; 430 pass, 1 pre-existing skip, 0 fail |
| `npm run typecheck` | 0 | PASS |
| `NEXT_TELEMETRY_DISABLED=1 npm run build` | 0 | PASS |
| `npm run test:security:offline` | 0 | PASS source checks |
| `npm run test:mutation-security:offline` | 0 | PASS 52 mocked assertions |
| `npm run test:auth-cookies:offline` | 0 | PASS 5 mocked cases |
| `npm run test:db-guards:offline` | 0 | PASS 8 offline refusals |
| `node scripts/test-feature-route-mocked.cjs` | 0 | PASS |
| `node scripts/test-governance-route-mocked.cjs` | 0 | PASS |
| `node scripts/test-growth-engine-db-boundary-mocked.cjs` | 0 | PASS |
| `node scripts/verify-production-migration-package.cjs` | 0 | PASS pins 001–009 |
| `node scripts/verify-authorization-trust-proposal.cjs` | 0 | PASS candidate 011 contract |
| `npm run migration:plan` | 0 | PASS offline plan, no connection |
| `git diff --cached --check` and protected baseline diff | 0 each | PASS; migrations/scripts/workflows unchanged |

An intermediate `npm run typecheck` returned exit **2** for a TypeScript function-existence guard in the new coordinator. That specific defect was corrected, and the final full unit/typecheck/build/security sequence above passed. No live MariaDB test, Node 22 test, authenticated staging E2E, provider probe or external publish was executed.
