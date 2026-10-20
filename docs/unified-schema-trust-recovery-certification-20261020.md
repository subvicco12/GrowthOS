# Independent unified schema, trust and recovery certification — 2026-10-20

**Production HOLD / NO-GO. Offline review PASS; Node 22 / live MariaDB / full unified recovery certification BLOCKED.**

Reviewed implementation commit: `5d2bbc5bd52d5077b95d139b0751de623284df0d` (tree `98dd3581be8a48ab1d98c4a3f19bd26a058b7e0e`). This evidence is added in a subsequent documentation commit on `certification/growthos-unified-schema-review-20261020`; the final branch HEAD is reported with delivery. No source branch is modified or merged.

## Source verification

| Read-only branch | Verified remote HEAD |
| --- | --- |
| feat/growthos-authorization-trust-20261019 | `8b0e2d9eb52eb184eb9ecc5ba5b2521eb0acf71d` |
| certification/growthos-mariadb-20261019 | `e5b2c9678bb57817ba6a18e0f85df681f8c4e8e6` |
| certification/growthos-expanded-backup-20261019 | `3e7d7622cb672beb6025a146cae2396baa3cc063` |
| feat/growthos-quota-settlement-20261019 | `bd4d08c36b4c2c0d2a909d42377be048e9779d47` |

`git fetch origin feat/growthos-authorization-trust-20261019 certification/growthos-mariadb-20261019 certification/growthos-expanded-backup-20261019 feat/growthos-quota-settlement-20261019` exited 0. `git ls-remote origin refs/heads/feat/growthos-authorization-trust-20261019 refs/heads/certification/growthos-mariadb-20261019 refs/heads/certification/growthos-expanded-backup-20261019 refs/heads/feat/growthos-quota-settlement-20261019` exited 0 and returned the exact SHAs above. This repository uses limited remote-tracking refs; an initial `git rev-parse origin/feat/growthos-authorization-trust-20261019 ...` could not resolve that local tracking name. Direct remote refs and pinned object reads established identity instead.

`git worktree add ../growthos-unified-schema -b certification/growthos-unified-schema-review-20261020 8b0e2d9eb52eb184eb9ecc5ba5b2521eb0acf71d` exited 0. Primary↔database and primary↔quota merge bases are the shared integration `ae1ccce603f7080c44e0c2025b00ce62105e8888`. Expanded-backup source descends from the database source. Work A/Work B histories remain ancestors of the primary; no source changes were imported by merging certification branches.

## Delivered scope and schema decisions

- `docs/unified-schema-inventory-20261020.md` and `database/proposals/unified-v2/inventory.json`: exact declared table/column/index/FK tuples, trigger identities/body hashes and 12 ledger hashes.
- `docs/unified-trust-recovery-design-20261020.md`: source contract reconciliation, quota transaction design, independent anchor/lease/fencing/custody options, least-privilege matrix, recovery contract and integration sequence.
- `database/proposals/unified-v2/012_quota_v2_candidate.sql`: separately reviewable additive quota proposal, never registered with an installer or executed.
- `database/proposals/unified-v2/source-lock.json` and `scripts/lib/unified-schema-review-v2.cjs`: pinned Git-object reuse of unchanged 010/v1 packages; no duplicate certified files or broadened old validators. Final aggregate contract is independently pinned in the new verifier.
- `scripts/lib/unified-recovery-v2.cjs`: bounded canonical HMAC data-only **review** archive validation, deterministic row counts/content hashes, scoped relationships and non-authorizing trust snapshot comparison. It deliberately exports **no restore executor**.
- `scripts/certify-unified-schema-v2.cjs`: offline plan and Node22/isolation-gated runner, reusing the unchanged hash-pinned owned-Docker supervisor and redirecting only its worker path.
- `scripts/unified-schema-v2-mariadb-tests.cjs`: prepared genuine SQL probes, independently re-verifying container/version/hostname/session identity before DB use; synthetic stdin credentials only.
- `scripts/test-unified-schema-v2-offline.cjs`: **40 final executed offline tests**. `docs/unified-schema-certification-results-20261020.json` stores actual command/exit evidence and log SHA-256s.

Planning inventories: 001–009 = **15 tables / 4 triggers / 23 FK columns / 9 ledger entries**; +010 = **20/11/40/10**; +011 = **28/28/92/11**; +012 = **31/35/114/12**. There are 83 explicitly declared indexes and 48 FK constraints in the final source-derived inventory. Actual implicit MariaDB index names/normalization remain unobserved. No installed-schema compatibility is claimed.

Migration numbering is resolved in this proposal as 010 content, 011 authorization/trust, 012 quota-v2. The nine certified migrations, 010 reference bytes, 011 source bytes, old runner/validators/archive contracts remain unchanged. Existing v1 inventory still refuses expanded data. No ledger row or DDL was executed. See the inventory for all nine baseline hashes and exact candidate hashes.

010 SHA-256: `bb10b32ec0186399ae10b1820541d4330aab500843cd0fcf2a82b4da515c2c5b`.

011 SHA-256: `7b9f5b15d2797c13bc6c30d04a08d49b5112a2545f264b543e86ffd5b303362a`.

012 SHA-256: `6d32ff6a950e9e90c40a4c5e5892c783914847c0f518faab980f08764bc310a6`.

Unified review contract SHA-256: `5b810bd2981ee4ef527e35de6704f9c0ce3969138541009023d43b25563a9b62`. Expanded backup v1 contract remains `17ce94be57e677190522341bf011195eba889938a89ec83cce99d8a589e17786`.

## Actual execution

Working directory: `/workspace/scratch/886c85eece52/growthos-unified-schema`. Runtime **Node v24.19.0**, ICU 78.3, tzdata 2026b. Dependencies reused via `ln -s ../growthos-release/node_modules node_modules` (exit 0); **no npm ci or Node22 parity** is claimed. Full unit/typecheck/build/security commands ran sequentially, avoiding `.next/types` races. No failed infrastructure discovery or certified restore drill was repeated.

| Exact command | Exit | Actual result |
| --- | ---: | --- |
| `node --check scripts/lib/unified-schema-review-v2.cjs` | 0 | PASS final syntax only. |
| `node --check scripts/lib/unified-recovery-v2.cjs` | 0 | PASS final syntax only. |
| `node --check scripts/certify-unified-schema-v2.cjs` | 0 | PASS final syntax only. |
| `node --check scripts/unified-schema-v2-mariadb-tests.cjs` | 0 | PASS final syntax only. |
| `node --check scripts/test-unified-schema-v2-offline.cjs` | 0 | PASS final syntax only. |
| `node scripts/certify-unified-schema-v2.cjs --plan` | 0 | PASS final 31/35/114/12 offline contract; databaseExecuted=false. |
| `node scripts/certify-unified-schema-v2.cjs --run` | 2 | Expected fail-closed refusal: Node.js 22 required; **live certification BLOCKED**, zero infrastructure/DB access. |
| `node --test scripts/test-unified-schema-v2-offline.cjs` | 0 | Final 40/40 PASS, no skips; reviewed SQL/model/archive/synthetic checks only. |
| `npm test` | 0 | 349 tests: 348 PASS, 1 existing SKIP, 0 FAIL; synthetic/mocked application coverage. |
| `npm run typecheck` | 0 | PASS TypeScript no-emit. |
| `NEXT_TELEMETRY_DISABLED=1 npm run build` | 0 | PASS local Next.js production compilation; no deployment. |
| `npm run test:security:offline` | 0 | PASS offline source checks. |
| `npm run test:mutation-security:offline` | 0 | PASS 52 mocked assertions. |
| `npm run test:auth-cookies:offline` | 0 | PASS 5 mocked cookie cases. |
| `npm run test:db-guards:offline` | 0 | PASS 8 refusal cases; no connection authorized. |
| `node scripts/test-feature-route-mocked.cjs` | 0 | PASS 10 feature/security cases. |
| `node scripts/test-governance-route-mocked.cjs` | 0 | PASS 8 grouped route cases. |
| `node scripts/test-growth-engine-db-boundary-mocked.cjs` | 0 | PASS non-UTC refusal/model rollback; not quota-v2 SQL. |
| `node scripts/verify-production-migration-package.cjs` | 0 | PASS original package pins. |
| `node scripts/verify-authorization-trust-proposal.cjs` | 0 | PASS unchanged 011 source model. |
| `npm run migration:plan` | 0 | PASS offline existing migration plan; installation unauthorized. |
| `git diff --check` | 0 | PASS whitespace. |
| `git diff --cached --check` | 0 | PASS staged whitespace. |
| `git diff --exit-code 8b0e2d9eb52eb184eb9ecc5ba5b2521eb0acf71d -- database/mysql database/proposals/011_authorization_trust_candidate.sql database/proposals/011_authorization_trust_manifest.json scripts/mariadb-migration-runner.cjs scripts/disposable-dump-guard.cjs scripts/disposable-backup-restore-rehearsal-candidate.cjs scripts/production-migration-executor-candidate.cjs .github/workflows staging` | 0 | Empty diff: protected files unchanged. |

Initial review implementation had two parser failures (exit 1): newline trigger/FK grammar was not handled; fixed and final inventory/type/index tests pass. Initial offline suite had 36 PASS / 1 FAIL because a deliberately nonexistent PATH hid Git before the runtime guard. The runner now checks Node22 before loading pinned sources in run mode; final refusal test passes without Git/Docker on PATH. Subsequent candidate design refinements aligned version-zero reservations, late refunds, service actor identity and authorization freshness; final affected offline/syntax/plan/refusal checks reran. No final executed check is failing. The full app unit/type/build runs precede those final proposal/offline-only refinements; no application source changed afterward.

## Prepared versus unimplemented live gates

All entries below are **NOT EXECUTED**. Node24 refuses before Docker or database access; existing environment assessment (Node22/Docker/MariaDB unavailable) was reused, not rediscovered. No commands use caller DB identity or real credentials.

| Gate | Prepared executable coverage | Actual status |
| --- | --- | --- |
| Migration ordering / expanded inventory | Wrong 011-before-010 refusal; ordered pinned DDL/ledger; exact table/trigger names, InnoDB/collation, FK-column and ledger counts | BLOCKED runtime/isolation; SQL unverified |
| Partial installation / retry | Partial 010 DDL leaves nine ledger rows; retry refuses | BLOCKED |
| Tenant and quota contention | Two sessions serialize a synthetic last-slot protocol on the org budget row; cross-org FK refusal; rollback and disconnected session | BLOCKED; tests protocol SQL, not absent durable quota adapter |
| Claims/content/journals | Duplicate two-session claim; CAS; claim/content rollback; terminal identity/reset/delete and immutable content event refusal | BLOCKED; does not certify full authenticated issuance/claim adapter |
| Revocation locking | Monotonic revoked projection; competing locked transaction times out then advances without unrevoking | BLOCKED; independent anchor revocation race still unimplemented |
| Privilege tests | Separate read-only principal refuses trust writes, issuance and DDL | BLOCKED; full issuer/writer/consumer/financial column-grant suite still unimplemented |
| Signed quota settlement | Design + immutable posting/FK/identity SQL + offline schema checks | Durable adapter/actual charge/refund/settlement concurrency fixtures still unimplemented |
| Independent anchor / fencing / deadlocks | Required two-process partition/lease/revocation/unknown-commit matrix documented | Backend and executable cross-process/deadlock scenarios still unimplemented |
| Unified populated backup/restore / interruption / corruption | Data-only ledger-populated offline archive corruption/scope/hash tests | Full populated fixture, restore executor and genuine round trip still unimplemented; **not** merely awaiting a server |
| Node22 / authenticated staging | No substitute mock certification | BLOCKED |

The SQL worker deliberately exits **2 / fullCertification BLOCKED** even if its prepared protocol probes succeed, listing the missing broader gates. It cannot yield a misleading complete certification PASS.

Future SQL-probe invocation requires an independently approved preloaded image digest and permitted local Docker socket, no escalation:

```sh
# Fetch pinned source objects if not already present; inspect SHA matches before proceeding.
# Set GROWTHOS_CERT_MARIADB_IMAGE=mariadb@sha256:<independently-reviewed-preloaded-digest>
GROWTHOS_CERT_DISPOSABLE=YES GROWTHOS_UNIFIED_CERT_DISPOSABLE=YES node scripts/certify-unified-schema-v2.cjs --run
```

Never invent the digest, pull images automatically, accept remote Docker endpoints or reinterpret the placeholder as executable configuration. The unchanged supervisor generates synthetic credentials, owns an internal single-container tmpfs network with one host-loopback DB port, and cleans only its owned resources. Worker independently checks metadata and MariaDB11.8 before creating growthos_test_cert_* schemas. It starts no app/provider/publisher/worker and all synthetic website switches/budgets stay disabled/zero.

## Remaining release gates and next sequence

Review 012 scope/ID bounds and mandatory durable funding guard → implement atomic quota/authorization/claim transaction and signed financial reconciler → certify independent anchor/fencing/custody and distinct database grants → execute Node22/disposable MariaDB migrations and complete application concurrency/deadlock/revocation/settlement tests → implement/certify separately versioned populated unified restore and current-anchor reconciliation → authenticated isolated staging and independent release approval.

An ordinary table/file, HMAC hash chain without an independently retained latest root, or restored etcd snapshot does not establish rollback-resistant revocation. Low-cost option analysis and explicit HOLD fallback are in the design document. No external anchor is provisioned or represented as certified.

No production/Hostinger/customer data/real credentials/paid infrastructure/provider calls, Actions/PRs/merges/deployments, publishing or automation activation occurred. Protected source branches and previous recovery packages remain untouched. **Release readiness: NOT READY. Production HOLD / NO-GO.**
