# GrowthOS — database runtime certification gate

Status: **BLOCKED — do not deploy**. Last verified Work report: `docs/isolated-mariadb-readiness-20261012.md` (commit `83262d5`). This is a plan, not evidence that database tests passed.

## Confirmed evidence
- Isolated npm test: 214 passed, one database test skipped; TypeScript and Next.js build passed in the preceding isolated Work run.
- Offline migration planning and parsing for 001–009 passed.
- MariaDB 10.11 bootstrap succeeded, but server startup failed with `EPERM` when creating an AF_UNIX socket; migrations and approval assertions **did not run**.
- MariaDB 11.8 runtime compatibility is **not verified**.

## Execution environment
Use an isolated machine or container runtime that permits **local loopback TCP or Unix sockets**, with MariaDB **11.8.x**, Node.js and installed project dependencies. Never reuse production credentials, connect to Hostinger, or run against the production database `u917733804_BtNpX`.

Create a **new, empty** local schema named `growthos_test_<unique_suffix>` and a least-privileged local test user with only the permissions needed for DDL and test fixtures on that schema. Confirm the database host and identity independently before supplying credentials. No test data may be copied from production.

## Execution (only in the isolated local environment)
1. Verify `SELECT VERSION()` reports MariaDB 11.8.x and `SELECT DATABASE()` names the new empty `growthos_test_*` schema.
2. Run `npm ci --ignore-scripts --no-audit --no-fund` in a clean checkout of the reviewed development branch; record exact commit and Node version.
3. Run `npm test`, `npm run typecheck`, `npm run build`, and `npm run test:security:offline`; capture exit codes.
4. Set `GROWTHOS_DB_HOST`, `GROWTHOS_DB_PORT`, `GROWTHOS_DB_USER`, `GROWTHOS_DB_PASSWORD`, `GROWTHOS_DB_NAME` to the disposable instance only; set `GROWTHOS_MIGRATION_TEST_DISPOSABLE=YES`. Run `node scripts/mariadb-migration-runner.cjs --test-disposable` **once** against the initially empty schema.
5. Inspect the migration runner's final PASS output: nine ledger entries, 15 InnoDB tables including ledger, four audit triggers, foreign-key and audit-immutability checks.
6. Set `GROWTHOS_TEST_DB_DISPOSABLE=YES` and run `npm run test:approval:mysql` against the same isolated schema. Record the concurrency, idempotency, tenant-boundary and immutable-audit results.
7. If any migration fails, do **not** blindly rerun on a partially migrated schema. Preserve sanitized logs, then discard the disposable schema through local test-environment controls. Never perform cleanup on production.
8. Prepare a signed-off report identifying exact commit, MariaDB and Node versions, command results, failures and remaining risks. Do not infer production readiness solely from a passing disposable database test.

## Stop conditions
Stop immediately if the DB host is not positively identified as isolated/local, schema name is not `growthos_test_*`, the schema is nonempty before migrations, MariaDB version differs from the target, a command attempts external connections, or the environment disallows local sockets.

## Production gates still separate
Production schema review, authorized backup-and-restore rehearsal, secrets/configuration review, authenticated end-to-end testing, rollout/rollback rehearsal and explicit deployment approval remain separate. **No GitHub Actions, merges, Hostinger changes, live automations, or paid services are authorized by this document.**
