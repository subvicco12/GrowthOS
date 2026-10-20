# Independent publication MariaDB and recovery review — 20 October 2026

**Production HOLD / NO-GO.** Source `feat/growthos-publication-sql-participant-20261020` is `78f0360f48e6fc2bdf3dc814da29a98726cf06a3`; its merge base with `624a1c2a0b9c04f506bc269918c5aae180ccb179` is that exact commit. This branch is `certification/growthos-publication-mariadb-20261020`. No database connection, SQL installation, backup or restore was attempted.

## Candidate and preservation review

| Candidate | SHA-256 | Status |
| --- | --- | --- |
| 010 content | `bb10b32ec0186399ae10b1820541d4330aab500843cd0fcf2a82b4da515c2c5b` | Read-only pinned source branch |
| 011 authorization | `7b9f5b15d2797c13bc6c30d04a08d49b5112a2545f264b543e86ffd5b303362a` | Unchanged |
| 012 quota | `6d32ff6a950e9e90c40a4c5e5892c783914847c0f518faab980f08764bc310a6` | Read-only pinned source branch |
| 013 funding/jobs | `049f16c9c9eb9336c60b9d3ebf42d5f66763257146d4d99714b0f74e7aea481e` | Unchanged |
| 014 observation scope | `d341bb3bc004b332f7cbc8253c2e5eb5255a4b8120860ae5d453f87762ee71b8` | Unchanged, review-only |

Candidate 014 proposes three ALTER statements: unique composite parent keys on observations and jobs, four nullable scope columns and two composite FKs on job events, and a CHECK requiring complete scope for `reconcile` and absent scope for other events. It adds zero tables, zero triggers, 14 FK columns, and would bring the **proposed**, uninstalled inventory to 34 InnoDB tables, 42 triggers, 169 FK columns and 14 ledger entries. Composite keys and nullable FK semantics require live MariaDB verification. The observation itself has no destination/claim fields; the event-to-job FK and independently verified signed payload must jointly bind them. A database FK alone does not prove a signature, issuer revocation, freshness, destination or claim. No defect justifying an untested amendment was established. Migrations 001–013, the migration runner, certified backup/restore scripts, trust contracts and candidate 014 were left untouched.

## New recovery v4 review contract

`scripts/lib/publication-recovery-v4.cjs` is a separately versioned, **non-executable** archive validator. It requires distinct `growthos_test_*` identities, an independently verified empty destination, current independent trust reconciliation, a caller-supplied independently derived metadata digest, a 32-byte archive key, canonical UTF-8 and authenticated payload, exact proposed table inventory/counts, fourteen exact ledger IDs and SHA-256 hashes, typed rows, row limits, canonical ordering and per-table deterministic SHA-256. It rejects corrupt/altered archives, wrong destinations, partial/nonempty destinations and trust uncertainty. It contains no SQL interpreter, DB client, dump importer, credential loader or restore entry point. Passing its synthetic fixture is **not** backup or restore certification. The independent reference metadata must ultimately pin every column, index, FK, trigger, CHECK, collation and engine; the actual implementation and populated cross-table semantic checks remain outstanding. Existing recovery v1/v2 packages are unchanged.

`scripts/certify-publication-mariadb-preflight.cjs` checks exact 010–014 content pins and local executable versions without contacting a server. Even when versions match, it reports `ENVIRONMENT_TO_VERIFY_MANUALLY`: isolation, credentials, loopback binding, independent trust and a new empty schema still need positive verification. It never authorizes SQL installation.

## Reproducible disposable certification sequence — not executed here

1. Provision Node 22 and MariaDB 11.8 with loopback-only networking in a disposable container/VM, synthetic credentials, a distinct empty `growthos_test_*` schema and two independent sessions. Prove the destination, process and credentials cannot reach production. Verify no publishing/automation.
2. Extract reviewed 010 and 012 from their exact source SHAs, verify all candidate pins and existing 001–009 package hashes. Run the preflight, then separately approve an isolated test runner. Apply ledger and 001–009, followed by reviewed 010–014 in order; abandon and recreate a schema after any failed DDL. Never retry a partial installation. Confirm exact metadata, ledger hashes, 34/42/169 inventory, triggers, CHECKs, indexes, collations and FKs from `information_schema`.
3. With two separate connections, test same-claim contention, distinct quota funding, last-slot reservation, deadlock victim rollback, authorization revocation and tenant mismatch; verify claim/funding/content/job/audit commit together. Force rollback and transport loss around COMMIT. Treat an unknown COMMIT as operator HOLD until independently reconciled; never retry dispatch. Verify immutable audit and minimum installer versus runtime grants.
4. Populate **synthetic** source and verify actual source table row counts/hashes, scoped JSON/evidence, signed issuer/revocation and independent anchor. Export with no inherited MariaDB client defaults. Reject executable comments, schema switching, unsafe DDL/directives and corrupted bytes. Restore only into a separately verified empty disposable schema. Independently compare every row hash and metadata object, FK enforcement, trigger immutability, ledger and current trust. Reject wrong destination, interruption, partial restore and retry; discard failed destination.
5. Record exact server/client versions, SQLSTATEs, session IDs, concurrency ordering, commands/exit codes, metadata snapshots and content hashes. Do not use these steps as a production installer.

## Executed evidence and blockers

`node -v` returned `v24.19.0`; `docker`, `mariadbd`, `mariadb`, `mariadb-dump` and `node22` were unavailable. With pinned 010 and 012 extracted read-only into `/tmp/growthos-cert-010.sql` and `/tmp/growthos-cert-012.sql`, `GROWTHOS_CANDIDATE_010=/tmp/growthos-cert-010.sql GROWTHOS_CANDIDATE_012=/tmp/growthos-cert-012.sql node scripts/certify-publication-mariadb-preflight.cjs` exited **2 / BLOCKED**. All live migration, two-session, rollback, privilege, populated backup/restore, corrupt-dump, interrupted restore and recovery assertions are **BLOCKED**, not passed. No SQL was executed.

| Executed command | Exit | Result |
| --- | ---: | --- |
| `node --check scripts/lib/publication-recovery-v4.cjs` | 0 | PASS |
| `node --check scripts/test-publication-recovery-v4-offline.cjs` | 0 | PASS |
| `node --check scripts/certify-publication-mariadb-preflight.cjs` | 0 | PASS |
| `node scripts/test-publication-recovery-v4-offline.cjs` | 0 | PASS: synthetic positive and 15 refusal cases; no restore |
| `node scripts/verify-publication-observation-scope-candidate.cjs --candidate-010=/tmp/growthos-cert-010.sql --candidate-012=/tmp/growthos-cert-012.sql` | 0 | PASS: pinned static 014 |
| `node scripts/test-publication-observation-scope-offline.cjs --candidate-010=/tmp/growthos-cert-010.sql --candidate-012=/tmp/growthos-cert-012.sql` | 0 | PASS: one positive, seven refusals |
| `node scripts/verify-production-migration-package.cjs` | 0 | PASS: offline 001–009 |
| `npm test` | 0 | PASS: 449 discovered; 448 pass, one skip |
| `npm run typecheck` | 0 | PASS, Node 24 |
| `NEXT_TELEMETRY_DISABLED=1 npm run build` | 0 | PASS, Node 24 |
| `npm run test:security:offline` | 0 | PASS |
| `npm run test:mutation-security:offline` | 0 | PASS: 52 assertions |
| `npm run test:db-guards:offline` | 0 | PASS: eight refusal cases |

Independent fencing and signed connector authority, quota budget authority, `_factory` record integration, revision callback wiring, an exact-metadata/semantic recovery executor and authenticated isolated staging remain release blockers. Production remains **HOLD / NO-GO**.
