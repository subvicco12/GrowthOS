# Atomic publication transaction boundary — 2026-10-20

**Production HOLD / NO-GO. Offline transaction transport only; claim and workflow persistence remain BLOCKED.** Source `feat/growthos-publication-funding-schema-20261020` was verified at `cea50c0574fd718fb6cf144d256371803b661a2d`. No migrations 001–012, certified safeguards or candidate 013 were modified or installed. No route, worker, provider or publisher uses this adapter.

## Independent contract review

The exact 010 claim and 011 authorization columns `reservation_id CHAR(36)` FK to legacy `growth_ai_reservations`; 012's quota-v2 publication funding uses `id VARCHAR(128)` with `operation='publication'`. Candidate 013's immutable binding refers to the same legacy generation ID in both claim and authorization and separately to the scoped publication funding ID. Its four proposed unique keys are necessary composite FK targets. Three proposed tables add job CAS/version/state, immutable funding binding and event history. The scheduled-job insert trigger and update trigger require a scheduled row to be inserted before transition to awaiting status, with version increment and journal insertion in one transaction. The longest new index was statically estimated in the prior review but is not MariaDB-certified.

**Additional review finding:** `fk_pub_job_observation` links an event to an observation by `(organization_id,issuer,event_id,payload_hash)` but does not include website, content or channel. The referenced 010 observation has these scoped fields; the current FK alone cannot prove a status observation belongs to the same job. A real reconciler must lock and compare all fields, and a separately reviewed additive composite key/FK amendment should be evaluated before certification. Existing candidate 013's pin was preserved in this branch. Exact inherited CHAR collation, ENUM FK compatibility, index width, CHECK evaluation and trigger behavior remain unverified in MariaDB.

## Implemented boundary

`MySQLAtomicPublicationRepository` owns one supplied `mysql2` connection and starts one transaction. It requires an explicitly injected participant with the `certified-010-013-atomic-participants` capability and refuses construction if the required methods are absent. It calls `assertCompatible` before opening the transaction, checks the independent lease, enforces all twelve participant operations in the coordinator's fixed order, requires completion, checks the lease again immediately before COMMIT, and releases the connection. A failed pre-COMMIT stage rolls back. A COMMIT transport failure is marked `PUBLICATION_COMMIT_INDETERMINATE`; rollback is not claimed to undo an attempted COMMIT. Readback is scoped and delegated solely for operator HOLD, never as authorization to retry. The constructor does not confer trust on an ordinary SQL lease or prove that an injected participant is certified.

This is **not** a real claim/authorization/quota-v2 SQL participant. The existing `UnavailablePublicationJobStore` remains the workflow default, and no SQL callback or fake issuer is registered. Actual atomic claim, quota start/charge journal, authorization use, content event, immutable binding, job event and audit cannot safely be wired until candidate 010–013 installation, independent trust and quota authority, and verified lock ordering exist. The legacy `MySQLPublicationClaimStore.claimOnce` opens and commits its own transaction and cannot be called inside this boundary.

Same-transaction revision invalidation is also BLOCKED. `FactoryDurableAuthorities.invalidate` is a required injected callback, but no implementation yet locks every old scheduled job, refuses claimed/ambiguous jobs, cancels the old authorization and releases unstarted funding with a quota-v2 event within the content CAS transaction. No substitute callback was added.

## Executed evidence

Environment: Node `v24.19.0`; existing local dependencies were reused. `node22`, `docker`, `mariadbd`, `mariadb` were absent on PATH; no isolated DB or synthetic credentials were available. No DB command was run. The four new mocked transaction cases cover ordered one-connection execution, missing/failed/out-of-order stages and rollback, stale independent witness, unknown COMMIT without rollback/retry, missing participants and invalid tenant scope. These simulate the connection and are **not** two-session MariaDB or actual independent-fence evidence.

| Command | Exit / result |
| --- | --- |
| `node --import=tsx --test src/core/__tests__/mysql-atomic-transaction.test.ts` | 0, 4/4 PASS |
| `npm test` | 0, 439 total; 438 pass, 1 skip, 0 fail |
| `npm run typecheck` | 0, PASS |
| `NEXT_TELEMETRY_DISABLED=1 npm run build` | 0, PASS |
| `npm run test:security:offline` | 0, PASS |
| `npm run test:mutation-security:offline` | 0, 52 assertions PASS |
| `npm run test:auth-cookies:offline` | 0, PASS |
| `npm run test:db-guards:offline` | 0, 8 refusals PASS |
| `node scripts/test-feature-route-mocked.cjs` | 0, PASS |
| `node scripts/test-governance-route-mocked.cjs` | 0, PASS |
| `node scripts/test-growth-engine-db-boundary-mocked.cjs` | 0, PASS |
| `node scripts/verify-publication-funding-proposal.cjs --candidate-010=../growthos-db-certification/database/proposals/010_content_persistence_candidate.sql --candidate-012=../growthos-unified-schema/database/proposals/unified-v2/012_quota_v2_candidate.sql` | 0, review-only PASS |
| `node scripts/test-publication-funding-proposal-offline.cjs --candidate-010=../growthos-db-certification/database/proposals/010_content_persistence_candidate.sql --candidate-012=../growthos-unified-schema/database/proposals/unified-v2/012_quota_v2_candidate.sql` | 0, 12 refusals PASS |
| `node scripts/verify-production-migration-package.cjs` | 0, PASS |
| `node scripts/verify-authorization-trust-proposal.cjs` | 0, PASS |
| `npm run migration:plan` | 0, plan only PASS |

The table records the final sequential run; verify against the command logs before relying on its counts. No Node 22, MariaDB 11.8, schema installation, grant, external anchor, crash recovery or authenticated staging certification occurred.

## Required integration sequence

Review the observation FK scope and certify installed 010–013 metadata on a fresh isolated MariaDB 11.8 schema. Implement independently anchored fencing with a nonescaping lease through COMMIT, scoped current approver/session/connector checks, quota-v2 budget reservation/start/journal and verified settlement, then one concrete SQL participant using the exact same connection. Implement revision invalidation and a `PublicationJobStore` that shares that connection for scheduling, cancellation and signed-only reconciliation. Exercise actual two-session contention, rollback, COMMIT loss and restore/replay with synthetic data. Continue holding publishing and automation disabled until separate release approval.
