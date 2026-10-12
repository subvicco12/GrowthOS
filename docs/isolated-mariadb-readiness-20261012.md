# GrowthOS disposable MariaDB release-readiness report

Branch: `feat/ci-cost-guardrails-20261011`. Starting commit: `f5181bcd13600a77ab122c8e68a66433d8abcc36`.

**Release decision: BLOCKED. Database runtime validation has not passed.**

## Isolation and provisioning

Docker was unavailable. MariaDB binaries were downloaded and extracted into a private scratch directory; no package installation, system service, or production access occurred. MariaDB 10.11.14 bootstrap successfully initialized a fresh disposable data directory. The server package SHA-256 matched the Ubuntu package index: `851dee13f004199973a044a3449c4ce55406e3065896998a2ed02e1a9d4f9fdb`.

Server startup used `--no-defaults`, an explicit local data directory and Unix socket, `--skip-networking`, and `--skip-log-bin`. An inherited seccomp filter additionally blocked IPv4/IPv6 socket creation. The environment itself also prohibits Unix socket creation: the daemon failed with `Can't start server : UNIX Socket : Operation not permitted`, and an independent Python AF_UNIX socket probe returned EPERM. No accepting database instance could be provisioned. The initialized directory was discarded after the attempt.

The guarded migration and approval commands were attempted with a clean environment, synthetic test-only credentials, a `growthos_test_*` name, and explicit disposable flags. A scratch-only mysql2 transport preload forced the local Unix socket for both connections and pools; that preload is not part of repository source. No external database connection was attempted, and no application migrations or synthetic fixtures were written to a running server.

## Actual results

| Check | Result | Evidence |
| --- | --- | --- |
| MariaDB system-table initialization | PASS | Fresh local bootstrap returned exit 0 |
| Disposable server startup | BLOCKED | Unix socket creation returned EPERM; server exited 1 |
| Guarded nine-migration runtime test | BLOCKED / command exit 1 | `TEST FAILED: connect EPERM` for the local Unix socket; zero application migrations applied |
| Approval integration suite | BLOCKED / command exit 1 | 1 test failed at its first fixture INSERT with connect EPERM; 0 passed, 0 skipped; concurrency/replay/tenant/audit assertions were not reached |
| Nine-migration offline plan | PASS | All 001–009 filenames and hashes listed, 14 application tables and four trigger names identified |
| Offline SQL statement parser | PASS after fix | 19 statements across nine migrations; previously covered only eight |
| Offline preflight, synthetic empty export | PASS after fix | Includes migration 009 |
| Offline preflight, synthetic migration-009 table collision | PASS: expected refusal | Exit 1 identifies the feature-audit table collision |
| npm test after offline fixes | PASS | 214 passed, 0 failed, 1 database integration test skipped; 215 total |

## Confirmed defects repaired

Both offline migration utilities omitted migration 009 even though the guarded runner requires exactly nine migrations. Updated the parser to validate the feature-audit table and both multiline trigger statements, and updated the Python preflight to include 009 so it detects that table's name collision. Corrected the disposable runbook's stale eight-migration descriptions. No database schema or application behavior was changed based on unexecuted runtime assertions.

## Remaining release gates

1. Run the guarded migration and approval integration commands in an isolated runtime that permits local database sockets. Require nine ledger entries, 15 total InnoDB tables including the ledger, four immutable-audit triggers, FK checks, and passing concurrent decision/replay/tenant isolation assertions.
2. Validate on the documented MariaDB 11.8 target. Only 10.11.14 bootstrap was available here; no 11.8 compatibility claim is made.
3. Verify backup/restore and production configuration through separately authorized work before release. This task did not access Hostinger or production.

No GitHub Actions, PRs, merges, deployments, paid services, automation activation, production credentials, or Hostinger changes occurred. Prior Node test/typecheck/build success does not certify database release readiness.
