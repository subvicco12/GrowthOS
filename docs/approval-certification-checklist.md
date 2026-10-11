# GrowthOS approval subsystem — certification checklist

Status: **NOT CERTIFIED**. Do not deploy or merge on the strength of this document.

## Verified on 2026-10-11

- A local Node.js syntax check of the isolated integration runner passed.
- Running that runner with no disposable-database configuration exited with code 2
  and refused to access any database, as intended.
- An offline npm dependency installation failed with ENOTCACHED because the
  packages were not available in the local cache.

## Not verified

- Full `npm run typecheck`, `npm test`, and `npm run build`.
- MySQL migrations 001-008 against a disposable MySQL 8 instance.
- Concurrent conflicting decisions, identical retries, tenant isolation,
  transaction rollback, and audit UPDATE/DELETE rejection.
- Database user privilege separation, trigger deployment compatibility,
  authentication endpoint behavior, and staging runtime integration.

## Required certification procedure

1. Use an explicitly approved, empty, isolated MySQL 8+ database named
   `growthos_test_<identifier>`. Do not reuse production credentials.
2. Install dependencies from the repository in a network-enabled development
   environment, generating and reviewing a lockfile before changing CI.
3. Apply MySQL schema and migrations 001-008 in order. Use a MySQL client that
   understands the `DELIMITER` directives in migration 008.
4. Run `npm run typecheck`, `npm test`, and `npm run build`.
5. Set the isolated test database credentials and
   `GROWTHOS_TEST_DB_DISPOSABLE=YES`, then run
   `npm run test:approval:mysql`. A skipped integration test is not a pass.
6. Record the test output, resolve failures, rerun the complete suite, and
   review the audit trigger behavior and database user privileges.
7. Obtain explicit approval before any production database migration,
   deployment, merge, spending, or website action.

All external publishing remains disabled.
