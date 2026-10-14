# GrowthOS — production readiness evidence and release hold (2026-10-14)

**Decision: HOLD. This file does not authorize production SQL, credentials, backups, deployment, or publishing.**

Repository: `subvicco12/GrowthOS`; branch: `feat/ci-cost-guardrails-20261011`.

## Evidence received (ChatGPT Work report supplied by user, not independently re-executed in this review)

- Isolated branch commit `87df29648ed2e88aa0799ff60093eb515d25e321`, including verifier fix `987a317`.
- MariaDB 11.8.5 on local `127.0.0.1:33079`, synthetic credentials, disposable `growthos_test_*` schema.
- Guarded migrations 001–009: PASS; ledger: nine matching hashes.
- Schema inventory: 15 InnoDB tables, four immutable audit triggers, 23 FK columns.
- FK enforcement, audit immutability, approval integration (concurrency, replay, idempotency, tenant isolation): PASS.
- Transaction fixture rollback: PASS.
- Interrupted install: partial DDL left two tables and zero ledger entries; automatic retry refused: PASS.
- Disposable recovery: discard/recreate *test-only* partial schema, then all nine migrations applied: PASS.
- Work reported disposable server, test schemas, credentials and binaries removed; no production connection.
- Earlier Work report: Node.js 22, 214 unit tests passing (one guarded DB test skipped), typecheck/build, offline security, eight negative DB guards, and migration offline contract: PASS.

## Production metadata observations (user-provided Hostinger screenshots; not a fresh query)

- Dedicated schema: `u917733804_growthos_prod` (distinct from older `u917733804_BtNpX`).
- MariaDB 11.8.9; `utf8mb4` / `utf8mb4_unicode_ci`.
- At screenshot time: zero tables and zero triggers.
- Account had database-scoped ALL PRIVILEGES in displayed grant; suitability for least-privilege runtime account is NOT established.
- Fresh metadata-only preflight script: `database/mysql/000_growthos_prod_metadata_preflight.sql`. **Do not execute without separate authorization.**

## Release gates still OPEN

1. **Fresh production schema comparison:** independent read-only inventory, verify schema identity, table/trigger counts, collation, MariaDB version, privileges and no drift. Prior screenshots are historical.
2. **Backup/restore plan and rehearsal:** approved provider-supported backup method, successful restore to a separate isolated destination, integrity/RTO verification. Never test destructive recovery on production.
3. **Migration delivery design:** reviewed production-only execution procedure; client `DELIMITER` handling for 008, trigger privileges, hashes and ledger ordering, explicit failure stop. Existing runner is disposable-test-only and must NEVER be repurposed to target production.
4. **Irreversible DDL rollback plan:** DDL can commit partially. No automatic retry, no DROP-based recovery on production. Stop and require incident-specific manual recovery approval.
5. **Security/configuration:** least-privilege runtime credentials, secret redaction, backups, access logging, TLS/connection path, database name isolation.
6. **Staging E2E:** synthetic owner/admin/viewer authentication, cookies, CSRF/origin, tenant isolation, approval idempotency, feature-off audit, publishing and automation disabled.
7. **Rollout/rollback and final approval:** signed release checklist, go/no-go owner, maintenance window, monitoring, restore triggers and explicit separate authorization before any production action.

## Release controls

- No production schema writes, imports, migrations, or test fixtures.
- No GitHub Actions, merges, deployments, Hostinger configuration changes, paid services, or publishing/automation activation.
- Never connect the disposable test runner to production.
- Production database stays unchanged until all gates are evidenced and explicitly approved.
