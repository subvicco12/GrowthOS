# Publication funding / job candidate evidence — 2026-10-20

**Status: offline PASS; live MariaDB and Node 22 BLOCKED; production HOLD / NO-GO.** Source `integration/growthos-durable-content-20261020` was pinned to `91991da4916aba38256e311b7ff0d03da6816df0`. Work is isolated on `feat/growthos-publication-funding-schema-20261020`. This review introduces an unregistered candidate 013, not an installed migration. Migrations 001–012, their runner and certified recovery code were not changed.

Runtime actually used: Node `v24.19.0`. Dependencies came from the existing local `node_modules` checkout; `npm ci` was not rerun. `node22`, `docker`, `mariadbd` and `mariadb` were unavailable on PATH. No isolated MariaDB endpoint or disposable synthetic credentials were established, so no SQL or two-session certification was attempted. The mocked reader and synthetic transactions do **not** establish InnoDB atomicity, FK compatibility, grant sufficiency, crash recovery or independent fencing.

## Actual execution

All commands below ran from this branch's worktree and returned exit code **0**. They were run sequentially to avoid Next.js generated type races. The `--candidate-010` and `--candidate-012` paths are read-only worktrees pinned to the referenced hashes; candidate 011 is present in this branch.

| Command | Result |
| --- | --- |
| `node --check scripts/verify-publication-funding-proposal.cjs` | PASS, exit 0 |
| `node --check scripts/test-publication-funding-proposal-offline.cjs` | PASS, exit 0 |
| `node scripts/verify-publication-funding-proposal.cjs --candidate-010=../growthos-db-certification/database/proposals/010_content_persistence_candidate.sql --candidate-012=../growthos-unified-schema/database/proposals/unified-v2/012_quota_v2_candidate.sql` | PASS, exit 0; review-only SHA/inventory verification, zero DB calls |
| `node scripts/test-publication-funding-proposal-offline.cjs --candidate-010=../growthos-db-certification/database/proposals/010_content_persistence_candidate.sql --candidate-012=../growthos-unified-schema/database/proposals/unified-v2/012_quota_v2_candidate.sql` | PASS, exit 0; one positive, 12 negative refusals |
| `npm test` | PASS, exit 0; 435 total, 434 pass, 0 fail, 1 skip |
| `npm run typecheck` | PASS, exit 0 |
| `NEXT_TELEMETRY_DISABLED=1 npm run build` | PASS, exit 0 |
| `npm run test:security:offline` | PASS, exit 0 |
| `npm run test:mutation-security:offline` | PASS, exit 0; 52 assertions |
| `npm run test:auth-cookies:offline` | PASS, exit 0 |
| `npm run test:db-guards:offline` | PASS, exit 0; 8 guard refusals |
| `node scripts/test-feature-route-mocked.cjs` | PASS, exit 0 |
| `node scripts/test-governance-route-mocked.cjs` | PASS, exit 0 |
| `node scripts/test-growth-engine-db-boundary-mocked.cjs` | PASS, exit 0 |
| `node scripts/verify-production-migration-package.cjs` | PASS, exit 0 |
| `node scripts/verify-authorization-trust-proposal.cjs` | PASS, exit 0 |
| `npm run migration:plan` | PASS, exit 0; plan only, no DB connection |

The focused `node --import=tsx --test src/core/__tests__/publication-atomic-integration.test.ts src/core/__tests__/publication-funding-recovery-reader.test.ts` initially exposed a missing witness refusal (7 pass, 1 fail, exit 1). A nullable witness had been converted with `String(null)` and accepted as the identifier `"null"`. The reader now requires actual typed non-null witness and identifier values. The same focused command then passed 8/8, exit 0; all full gates above were rerun after that fix. Synthetic negatives include duplicate funding, destination and website drift, rollback, ambiguous COMMIT hold, bad journal/hash/funding/claim/witness and forged terminal success without signed observation evidence.

## Schema decision and remaining gates

The publication claim and authorization keep the legacy `CHAR(36)` **generation reservation** identity. The immutable candidate binding adds a separate, tenant/content/operation-scoped quota-v2 **publication reservation** ID. The atomic interface checks them separately before an unknown-status transition, audit event and job persistence. The proposed 013 SHA-256 is `049f16c9c9eb9336c60b9d3ebf42d5f66763257146d4d99714b0f74e7aea481e`; 010/011/012 pins and complete inventory/privilege/recovery decisions are in `docs/publication-funding-job-schema-review-20261020.md` and `013_manifest.json`.

Candidate 013 proposes three tables, four composite-key additions, seven triggers, nine FKs/41 columns and 22 declared indexes. The **planned** aggregate after independent acceptance of 010–013 is 34 InnoDB tables, 42 triggers, 155 FK columns and 13 ledger entries; none is an observed database result. The frozen existing backup/recovery packages do not cover it. The reader is diagnostic only and always returns `publicationAuthorized:false`.

**BLOCKED release gates:** independent review and disposable MariaDB 11.8 application of ordered 010–013, exact collation/ENUM/FK/index/check/trigger behavior, real two-session double-claim/funding races and rollback, transactional write adapter, quota-v2 budget settlement, independent trust-anchor lease and signed connector revocation at COMMIT, same-transaction revision invalidation, least-privilege grants, backup/restore v3 with trust reconciliation, Node 22 parity, and authenticated isolated staging. No publisher, worker or retry dispatcher is enabled.
