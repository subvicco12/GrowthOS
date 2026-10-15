# GrowthOS — production compatibility and backup/restore acceptance plan (2026-10-15)

**Status: PREPARATION ONLY / NO-GO. No production connections or writes authorized.**
Repository `subvicco12/GrowthOS`, development branch `feat/ci-cost-guardrails-20261011`, certified executor candidate commit `9b4f832af07a29721ba0ee3c05d29b8be780ec45`.

## Evidence distinction

- **Isolated Work report (user-provided screenshots):** Node.js 22.16.0, MariaDB 11.8.5, synthetic loopback credentials, 001–009 installed with 9 matching ledger hashes, 15 InnoDB tables, 4 audit triggers, 23 foreign-key columns. Offline refusal and tamper tests passed. Interrupted execution (exit 137) left 10 tables and 3 ledger rows; retry refused. Fresh separate disposable recovery schema passed.
- **Historical Hostinger screenshots (not freshly rechecked):** dedicated `u917733804_growthos_prod`, MariaDB 11.8.9, `utf8mb4`/`utf8mb4_unicode_ci`, zero tables, zero triggers. Broad database-scoped grants shown. Legacy `u917733804_BtNpX` is NOT the GrowthOS target.
- **Not proven:** fresh production emptiness, exact grants at execution time, production restore ability, least-privilege runtime account, staging E2E, production execution path (disabled).

## A. Read-only production compatibility gate (separate explicit authorization required)

Use `database/mysql/000_growthos_prod_metadata_preflight.sql` only after independently confirming the selected database in phpMyAdmin. Capture sanitized results and compare:

| Invariant | Required outcome |
| --- | --- |
| Session schema identity | Exactly `u917733804_growthos_prod`; never the legacy database |
| Server | Supported MariaDB 11.8.x, record full version and connection endpoint |
| Charset/collation | `utf8mb4` / `utf8mb4_unicode_ci` unless explicitly reviewed |
| Existing tables | Exactly zero; any table is a STOP, not an automatic cleanup instruction |
| Existing triggers | Exactly zero; any trigger is a STOP |
| Existing columns, indexes, FKs | Zero because schema must be empty |
| Database grants | Reviewed and documented without passwords; separate installer vs runtime privileges |
| Unexpected object, mismatched identity, missing access | STOP; investigate without modifying schema |

**Do not** collect customer rows, dump production data, import SQL, or modify Hostinger settings during this gate.

## B. Backup/restore rehearsal gate (separate explicit authorization required)

1. Record hosting provider's supported backup/export method, schedule, retention, storage region, encryption, access control, and exact restore scope.
2. Determine whether a zero-table database can be backed up and whether database account grants, triggers and schema defaults are included. A successful empty backup alone does not prove recoverability of a populated GrowthOS schema.
3. Rehearse on a **separate disposable isolated MariaDB 11.8 schema** with synthetic GrowthOS tables, nine migration ledger entries and synthetic fixtures. Never restore over `u917733804_growthos_prod`.
4. Verify the restored 15-table/4-trigger/23-FK inventory, nine ledger hashes, audit immutability, and sample synthetic row checksums. Record backup identifier, restore command/tool, exact exit codes, duration, checksum results and cleanup.
5. Test interruption of a disposable restore and ensure failed or partial restore is detected and cannot be mistaken for success.
6. Document who may authorize recovery, the restore destination, RPO/RTO targets, monitoring and incident decision criteria. Do not assert a target was met without measurement.

## C. Security and staging acceptance

- Separate installer DDL credentials from restricted runtime DML credentials; no passwords in screenshots, logs, GitHub, or chat.
- Verify connection routing, TLS where applicable, secret storage, DB grants, and denial of cross-schema access.
- Synthetic staging E2E: owner/admin/viewer, cross-tenant denial, CSRF/origin, approval idempotency, audit immutability, feature disable and publishing/automation OFF.
- Production migration path remains disabled. A disposable-only executor passing does not authorize changing its guards.

## D. Release decision

**NO-GO** until fresh metadata, restore rehearsal, staging security E2E, least-privilege configuration, release procedure and explicit separate approval are all recorded. No GitHub Actions, merges, deployments, database writes, publishing, paid services or automation activation.
