# GrowthOS offline integration closure — 24 October 2026

**Production HOLD / NO-GO.** Authorized branch `feat/growthos-final-product-closure-20261024`; starting GitHub HEAD `add4eb85b2e276105736e5e090843b5a39ce7e69`. Node.js 24.22.1, npm 11.9.0. No MariaDB connection, migration installation, provider dispatch, publishing, automation, payment or CI execution.

## Executed integration work

- Manual intelligence observations now have an explicit first-party preview → save unverified → read scoped history → revoke path. The save is a separate user action, uses a stable idempotency key and fixed observed/expiry times, and never marks manual claims as verified. The server continues to derive user, role and organization from the session and validates website scope. The UI checks response organization/website against the current selection and stops mutation retries after an uncertain COMMIT. Candidate 015 remains uninstalled, so persistence endpoints return service unavailable in this environment.
- The evidence adapter distinguishes a lost COMMIT reply from a definite rollback for both ingestion and revocation. It returns `EVIDENCE_COMMIT_UNKNOWN`; the HTTP boundary returns `EVIDENCE_OUTCOME_UNKNOWN_OPERATOR_HOLD` (503). Recovery requires independent scoped event lookup before any new action.
- Configured budget and completed-reservation cost projections parse exact unsigned integers. Unsafe aggregate counts refuse rather than rounding, and monetary minor units remain exact strings. A string `'0'` verification flag cannot be displayed as verified. Provider-billed spend and currency remain unavailable.
- The review-only candidate 015 hash is pinned by a static verifier with seven table, twelve trigger, twelve FK and nineteen FK-column inventory checks and mutation refusals. This is not SQL syntax, index, collation, grant, backup or live transaction certification.

## Contract map

| Boundary | Current status | Gate still needed |
| --- | --- | --- |
| MySQL session, selected organization and membership | Implemented, offline route refusals | Authenticated two-organization staging and revocation race |
| Manual intelligence preview and evidence | UI/API/store integrated; persisted paths unavailable until 015 | Candidate 015 MariaDB and recovery certification |
| Plan assignment and usage | Durable adapters and synthetic tests; production issuer absent | Independent issuer, key custody and live two-session 015 certification |
| Portfolio budget and feature shutdown | Read model hardened; switches disable-only | Live budget/grants/concurrency certification |
| Connector health/history/revocation | Signed evidence contract; runtime unknown without independent anchor | Anchor, issuer registry, destination fence and live revocation test |
| Approval/publication | One-connection candidate transaction; dispatch disabled | 010–014 installation review, trusted authorities, two sessions, recovery and staging |
| First-party mobile/tablet workspace | Responsive components and offline source/component checks | Real mobile/tablet authenticated staging |

## Review-only migration order and recovery

Certified 001–009 remain unchanged. Candidate 010 (`bb10b32ec0186399ae10b1820541d4330aab500843cd0fcf2a82b4da515c2c5b`) and 012 (`6d32ff6a950e9e90c40a4c5e5892c783914847c0f518faab980f08764bc310a6`) were fetched read-only from pinned repository commits into `/tmp` and independently hashed; neither is in this branch. Local candidate 011, 013 and 014 hashes match their existing pins. Candidate 015 is `50dc53b228a391bfe221cf92e7c855fedfb39c1ced1ed452da1aa56b96446551` and is not registered with the installer. The static 011/013/014/015 checks passed; they do not validate MariaDB's FK index widths, charset/collation, trigger execution or partial-DDL recovery.

If all 010–015 were independently accepted, the **proposed**, not observed, expanded inventory would be 41 tables, 54 triggers, 188 FK columns and 15 ledger entries (existing 014 recovery review plan: 34/42/169/14; proposed 015 adds 7/12/19/1). A separately versioned recovery package must pin every hash and inventory item, deterministic per-table content hashes, immutable evidence/usage journals, external trust roots and revocations; existing certified validators cannot be repurposed. Proposed SQL principals: separate evidence reader/writer, plan issuer and usage settler, with only necessary table-level SELECT/INSERT/UPDATE; no runtime DDL/DELETE, no shared plan-issuer credential, and tenant scoping enforced in application transactions. Actual grants require disposable MariaDB verification.

Disposable certification requirements: Node 22, independently verified loopback-only MariaDB 11.8, fresh `growthos_test_*` schemas, synthetic-only restricted credentials, pinned 001–015 packages, two distinct SQL connection IDs, isolated issuer/anchor implementation, exact metadata comparison, lock/race/deadlock/rollback/unknown-COMMIT scenarios, least-privilege principals, populated backup/restore with corruption/refusal tests, and authenticated staging. No SQL was run here.

## Actual offline results

| Command | Exit | Result |
| --- | ---: | --- |
| `npm test` | 0 | 505 tests: 504 pass, one skipped, zero fail |
| `node --import=tsx --test src/core/__tests__/product-workspace.test.ts src/core/__tests__/mysql-budget-overview.test.ts src/core/__tests__/mysql-intelligence-evidence.test.ts src/core/__tests__/product-authority-candidate.test.ts` | 0 | Targeted regression passed after JSX test fix |
| `node --import=tsx scripts/test-intelligence-preview-mocked.cjs` | 0 | 37 scoped/negative assertions |
| `node scripts/test-governance-route-mocked.cjs` | 0 | Tenant pagination, denial and recorded cost route passed after updating mock dependency |
| `node scripts/test-connector-health-routes-mocked.cjs` | 0 | 34 mocked assertions |
| `node scripts/verify-product-authority-candidate-offline.cjs` | 0 | 015 exact review hash/inventory |
| `node scripts/verify-authorization-trust-proposal.cjs` | 0 | 011 review verifier |
| `node scripts/test-publication-funding-proposal-offline.cjs --candidate-010=/tmp/growthos-candidate-010.sql --candidate-012=/tmp/growthos-candidate-012.sql` | 0 | 013 review, 12 refusals |
| `node scripts/test-publication-observation-scope-offline.cjs --candidate-010=/tmp/growthos-candidate-010.sql --candidate-012=/tmp/growthos-candidate-012.sql` | 0 | 014 review, seven refusals |
| `node scripts/verify-production-migration-package.cjs` and `npm run migration:plan` | 0 each | 001–009 package/plan only; no DB |
| `npm run typecheck` | 0 | TypeScript passed |
| `npm run test:security:offline`, `npm run test:auth-and-session:offline`, `npm run test:mutation-security:offline`, `npm run test:db-guards:offline` | 0 each | Passed; mutation 52 assertions, DB guards eight refusals |
| `NEXT_TELEMETRY_DISABLED=1 CIRCLE_NODE_TOTAL=2 npm run build` | 0 | Capped Next.js production build passed |

An initial 013/014 invocation without mandatory read-only 010/012 paths exited 1 (`CANDIDATES_010_012_REQUIRED` / `CANDIDATE_INPUT_REQUIRED`). The correct pinned inputs were retrieved and the suites passed. An initial governance mock invocation exited 1 because the new pure projection import was absent from its dependency map; the mock was fixed and passed. An initial component test exposed a missing React binding under the offline JSX renderer; it was fixed and passed. These initial failures were not MariaDB executions.

**Remaining release gates:** Node 22 parity; independent MariaDB 11.8 and expanded backup certification; independent issuer/key custody, monotonic fencing and revocation; production plan and connector authorities; authenticated isolated staging including mobile/tablet; explicit release approval. No synthetic test establishes production authority.
