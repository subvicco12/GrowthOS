# Hostinger MariaDB migration preflight (Growth OS)

Status: **PREPARED ONLY — NOT EXECUTED OR CERTIFIED**. Target: designated Hostinger database `u917733804_BtNpX` (reported MariaDB 11.8.9). This document does not establish live database state.

## Key finding

`database/mysql/001_core_schema.sql` explicitly says **run in an empty dedicated database only** and uses unqualified `CREATE TABLE` statements. The uploaded export was reported to contain existing WordPress/DigiForge tables. **Do not execute the baseline blindly**: it may collide with existing `growth_*` tables, and a partially successful DDL sequence is not transactionally rolled back by MariaDB. Never drop or truncate existing tables.

## Read-only SQL preflight (run in phpMyAdmin after a verified backup)

```sql
SELECT VERSION() AS server_version, DATABASE() AS selected_database;
SELECT TABLE_NAME, ENGINE, TABLE_ROWS
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = DATABASE()
ORDER BY TABLE_NAME;
SELECT TABLE_NAME
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME LIKE 'growth\\_%' ESCAPE '\\'
ORDER BY TABLE_NAME;
SELECT TRIGGER_NAME, EVENT_OBJECT_TABLE
FROM information_schema.TRIGGERS
WHERE TRIGGER_SCHEMA = DATABASE()
ORDER BY TRIGGER_NAME;
SELECT @@character_set_database AS db_charset, @@collation_database AS db_collation;
```

Compare the output with the snapshot, **not** just the database name. If any `growth_*` objects exist, stop and reconcile before writing. Verify database backup/restore and account permissions. Never share credentials in chat.

## Compatibility review

- Baseline uses InnoDB, `CHAR(36)` UUIDs, `ENUM`, `BOOLEAN` aliases, `BIGINT UNSIGNED`, `DATETIME`, `TIMESTAMP`, `CHECK`, foreign keys and composite keys; these constructs are generally supported by MariaDB 11.8, **but have not been executed against this Hostinger instance**.
- Migration `008_approval_audit_guards.sql` contains `DELIMITER`, a **client command**, not server SQL. It requires an appropriate SQL client/import procedure. Confirm phpMyAdmin trigger creation support and privileges before installation.
- Migrations `001` through `008` have dependencies and must be applied in numeric order, only after a table/trigger name collision check. There is no verified migration ledger or automatic recovery mechanism.
- MariaDB `CREATE TABLE` and `CREATE TRIGGER` cause implicit commits; a transaction wrapper does **not** make the entire migration reversible. Capture a fresh backup and test restore capability first.
- Connection settings, timezone handling, SQL modes, database privileges, and MySQL2 compatibility require actual Hostinger verification.
- `growth_approval_decisions` immutability triggers prohibit updates/deletes by the app user, but do not protect against administrators with elevated privileges.
- Legacy `database/migrations/*.sql` are PostgreSQL prototypes and **must not be applied**.

## Installation hold points

1. Obtain read-only live schema inventory, version, trigger list, and confirmed backup.
2. Compare actual schema with migration objects and verify no naming collisions.
3. Review all eight migration files and their dependencies; prepare an idempotent, recorded migration plan with explicit failure recovery.
4. Verify MariaDB compatibility in an isolated environment before applying DDL to this existing database. Never run destructive integration tests against existing production data.
5. Request **separate explicit approval** for live DDL, credential configuration, or website deployment.

**Current authorization is GitHub development branch edits only. No Hostinger changes, merges, deploys, DNS edits, or spending.**
