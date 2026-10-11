# Growth OS — MariaDB 11.8.9 migration review

Scope: GitHub development branch preparation only. **No live DB access, SQL execution, or production certification.**

## Uploaded export findings (2026-10-11 snapshot)
- Export reports server version `11.8.9-MariaDB-log`.
- 128 `CREATE TABLE` definitions were found.
- No `growth_*` table definitions and no top-level `CREATE TRIGGER` statements were found.
- The live Hostinger schema may have changed since the export; repeat the read-only inventory before any installation.

## Ordered review of migrations

| File | Objects | MariaDB review / hold point |
| --- | --- | --- |
| 001_core_schema.sql | organizations, users, memberships, websites, content policies, org budgets, AI reservations | InnoDB, FK and ENUM supported in principle; do not run blindly on populated database; check names and FK compatibility |
| 002_budget_incidents.sql | budget incident ledger | FK references 001; confirm no collision |
| 003_sessions.sql | session tokens | FK to users; ON DELETE CASCADE intentional, review retention |
| 004_login_throttles.sql | login rate-limit state | timestamp ON UPDATE supported in principle |
| 005_installation_state.sql | installation singleton plus initial row | INSERT is not idempotent; do not replay on existing installation |
| 006_approval_queue.sql | scoped approval queue | composite FK references unique org/site key from 001 |
| 007_approval_audit.sql | append-only decision history | composite FK references unique approval scope from 006 |
| 008_approval_audit_guards.sql | update/delete rejection triggers | DELIMITER is client-side; verify trigger privileges and import support |

## Adaptation strategy

**Do not rewrite migrations to use `CREATE TABLE IF NOT EXISTS` as a shortcut.** That can silently accept incompatible pre-existing tables. Instead:
1. Read-only inventory via `database/mysql/000_read_only_preflight.sql`.
2. Verify backup and ability to restore.
3. Verify the target database, privileges, SQL mode, character set, collation, and current tables/triggers.
4. Apply only after separate authorization, with a migration ledger and per-file postconditions; stop on any unexpected existing object.
5. Ensure each created object matches expected columns, indexes, FKs, and trigger definitions.
6. Use a dedicated disposable test schema for destructive tests, never the existing 128-table database.

## Outstanding validation

- No Hostinger MariaDB connection or credentials available to the development environment.
- No SQL parser or MariaDB engine test executed; syntax compatibility is assessed statically, not certified.
- Trigger installation method, privileges, and live backup still require verification.
- Application queries, transaction concurrency, and tenant isolation need integration tests.
- Migration ledger and safe installer remain to be implemented before production installation.

**Release gate:** no Hostinger changes, production SQL, merges, deployments, or spending without separate explicit approval.
