# GrowthOS — production migration execution and recovery runbook (DRAFT, NOT AUTHORIZED)

Status: **HOLD / offline planning only**. Source branch: `feat/ci-cost-guardrails-20261011`.
Target only after separate approval: dedicated `u917733804_growthos_prod`. Never use the legacy `u917733804_BtNpX`.

## Proven facts and boundaries

- Isolated MariaDB 11.8.5 Work certification at commit `87df29648ed2e88aa0799ff60093eb515d25e321` reported migrations 001–009, nine SHA-256 ledger entries, 15 InnoDB tables, four immutable triggers, 23 FK columns, approval integration and disposable recovery PASS.
- The existing `scripts/mariadb-migration-runner.cjs` is **disposable-test-only**. Its strict `growthos_test_*` and loopback guards MUST remain intact. Never change these guards to point at production.
- Migration 008 uses MySQL client `DELIMITER //` commands. `DELIMITER` is a client directive, not server SQL. The test runner extracts individual trigger statements. Any future production executor requires independently reviewed parsing and a dry-run/negative-test suite.
- Migration 009's source comment says dedicated **test** database. This must be reconciled and explicitly approved before any production execution.
- MariaDB DDL is not generally reversible with `ROLLBACK`. The interrupted-installation test left two tables and zero ledger entries; automatic retry was correctly refused. An empty ledger does NOT imply an empty schema.

## Before any production execution — mandatory gates

1. Confirm explicit, scoped approval for **read-only** production metadata inspection; verify database identity, server version, engine, charset/collation, tables, columns, keys, triggers, and permissions using `database/mysql/000_growthos_prod_metadata_preflight.sql`. Prior screenshots are historical.
2. Confirm backup policy, access, retention, encryption, restore ownership, and a successful restore rehearsal **on a separate isolated destination**; capture checksums and recovery time. No restore into production.
3. Independently inspect and approve exact migration files, SHA-256 manifest, statement ordering, trigger parsing, ledger schema and expected table/trigger/FK inventory.
4. Certify a **separate production execution mechanism** with synthetic credentials and disposable MariaDB 11.8, including failure injection, replay refusal, privilege failure, wrong schema, nonempty schema, unexpected version and partial-ledger cases. Production execution mechanism does not exist as an approved artifact yet.
5. Review database user privilege separation: install-time DDL privileges vs application runtime least privilege. Never expose secrets in logs, chat or commits.
6. Pass staging authenticated E2E and security gates with synthetic accounts, publishing disabled and automations disabled.
7. Obtain a separately recorded change approval, maintenance window, recovery owner and explicit GO decision.

## Proposed production install sequence (planning only)

- Verify the intended database name and connection destination using two independent read-only checks. Refuse if either differs.
- Refuse if any existing table or trigger is present; do not automatically adopt or overwrite a partial schema.
- Confirm a fresh verified backup/restore recovery point and tested permissions.
- Verify the exact SHA-256 digest of every migration and ledger against the signed-off manifest.
- Execute ledger and migration statements **one at a time**, recording a ledger entry only after the complete migration succeeds. Confirm all statements and privileges beforehand. Do not send `DELIMITER` to MariaDB server as SQL.
- After installation, verify nine ledger hashes, exact expected table/trigger inventory, InnoDB engines, FK constraints, charset/collation and disabled automation/publishing defaults.
- Only after separate app release approval consider configuring application connectivity. No automatic activation.

## Fail-closed incident and recovery procedure

**Any SQL error, connection interruption, mismatched hash, missing trigger, unexpected table, incorrect target, or uncertain state: STOP.**

- Disable further execution; capture sanitized error, migration identifier and last successful statement. Never print credentials or customer data.
- Inspect metadata and ledger **read-only** to classify partial DDL. Do not assume transaction rollback reverted DDL.
- Do not retry automatically, apply `DROP` / `TRUNCATE`, edit ledger rows, or attempt ad-hoc production repairs.
- Escalate to the named recovery owner. Select a separately approved recovery method (provider-supported restore or reviewed forward repair) only after assessing the actual schema state and backup.
- Verify restored/repaired metadata and application health; record incident evidence and a new GO/NO-GO decision.
- The disposable-test recovery approach (discard and recreate test schema) is **never** an instruction to delete the production database.

## Evidence to capture at each gate

Exact Git commit and migration hashes; isolated runtime logs; authorized preflight metadata; backup identifier and verified isolated restore results; permissions review; staging E2E results; execution owner; change approval; release/rollback plan; sanitized post-install verification.

## Prohibited actions under this runbook

No production SQL execution, schema changes, Hostinger settings changes, credentials access, backups, GitHub Actions, merges, PRs, deployments, paid services or automation/publishing activation without distinct authorization. This document alone never grants authorization.
