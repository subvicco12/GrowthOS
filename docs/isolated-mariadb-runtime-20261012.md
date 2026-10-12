# GrowthOS isolated MariaDB 11.8 runtime validation

Repository: `subvicco12/GrowthOS`; branch: `feat/ci-cost-guardrails-20261011`. Starting head: `95f432b821a0585d2a5613726f7c1cd29b0ffcbe`.

## Isolation

MariaDB 11.8.5 Community Server was downloaded from the official MariaDB archive and extracted in a private scratch directory. `mariadb-install-db` initialized a fresh data directory. The server ran with `--no-defaults`, `--skip-networking`, `--skip-log-bin`, and an explicit local Unix socket. The preflight confirmed `VERSION() = 11.8.5-MariaDB`, `@@skip_networking = 1`, and zero tables in the new `growthos_test_*` schema. A randomly generated synthetic password and a local test account were scoped to that schema. A scratch-only mysql2 transport shim forced both migration and approval connections to the verified local socket. No external or production database was contacted.
After verification, the local server shut down successfully (exit 0), and its disposable schema, data directory, binaries, and synthetic credentials were removed from scratch.

## Actual results

| Check | Result | Details |
| --- | --- | --- |
| `npm ci --ignore-scripts --no-audit --no-fund` | PASS | 58 packages installed from the committed lockfile; Node 24.19.0, npm 11.9.0 |
| `npm test` | PASS | 50 test-file results, 0 failures; the database test was gated off in this command and run separately below |
| `npm run typecheck` | PASS | Exit 0 when run separately from the build |
| `npm run build` | PASS | Next.js 15.5.24 optimized build; six static pages generated |
| `npm run test:db-guards:offline` | PASS | Eight refusals, covering remote host, production name, non-test name, and missing opt-in in both runners; outbound IP sockets denied during this check |
| Guarded `node scripts/mariadb-migration-runner.cjs --test-disposable` | PASS | Nine migrations and nine matching ledger hashes; 15 InnoDB tables including the ledger, four audit triggers, 23 foreign-key columns, functional trigger and FK rejection checks |
| `npm run test:approval:mysql` | PASS | One integration test, 0 failures, 0 skips; concurrent conflicting decisions, concurrent same-key replay, idempotency conflict, tenant boundary, audit immutability, and final queue status verified |

Initial approval attempts exposed two issues. The test process remained open because its mysql2 pool was not closed; a conditional `after` cleanup fixed this. The application validator required a five-group UUID, rejecting all valid four-group UUIDs with `INVALID_DECISION`; its pattern was corrected. The tenant-boundary test also reused a successful decision's idempotency key, so it reached `IDEMPOTENCY_CONFLICT` before the intended tenant check; it now supplies a fresh key. After these fixes the guarded approval test passed.

The first TypeScript run overlapped with `next build` rewriting `.next/types` and exited 2 with missing generated files. A sequential rerun exited 0. A restricted-shell invocation of the optional database guard script could not spawn its child process; it passed when rerun with network-denying seccomp isolation. Neither initial environment failure is represented as a passing run.

## Release status

**Local isolated database validation: PASS. Production release: BLOCKED pending separate gates.** The disposable test did not review the production schema, backup and restore, production credentials, authenticated end-to-end flows, deployment, or rollback. Tests used Node 24 while the repository CI specifies Node 22; runtime parity remains to be checked. No GitHub Actions, merge, deployment, automation activation, paid service, Hostinger, Paddle, or production change was performed.
