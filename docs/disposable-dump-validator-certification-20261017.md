# Disposable dump validator certification — 2026-10-17

Development branch: `feat/ci-cost-guardrails-20261011`. Base: `9f349f08de9851373c7d070ff052110bf12afb30`.
Production status: **HOLD / NO-GO**. This is isolated test evidence, not authorization to restore or migrate production.

## Executed checks

Node.js 22.16.0, MariaDB 11.8.5, synthetic `cert` credentials and `127.0.0.1:33079` only. MariaDB reported `@@bind_address=127.0.0.1`, `@@port=33079`, `@@skip_networking=0`. The server and all clients ran in the same isolated command session. Test schemas were created empty and disposed afterward.

| Command or case | Exit | Result |
| --- | ---: | --- |
| `npm ci --ignore-scripts --no-audit --no-fund` | 0 | 58 packages installed |
| `node --check` on five changed/new scripts | 0 each | PASS |
| `node scripts/test-disposable-dump-guard-extended-offline.cjs` | 0 | 5 allowed and 31 refused cases |
| `node scripts/test-disposable-backup-restore-offline.cjs` | 0 | 5 pre-connection and 9 dump refusals |
| `node scripts/test-production-migration-executor-offline.cjs` | 0 | 8 refusal tests |
| `node scripts/verify-production-migration-package.cjs` | 0 | PASS |
| `node scripts/test-production-migration-package-negative.cjs` | 0 | PASS |
| `npm run test:security:offline` | 0 | PASS |
| `npm run test:db-guards:offline` | 0 | 8 refusal tests |
| `node scripts/production-migration-executor-candidate.cjs --test-disposable` | 0 | 9 migrations applied to source |
| `node scripts/disposable-backup-restore-rehearsal-candidate.cjs --rehearse` | 0 | Populated source restored into independent empty destination |
| Corrupt dump with executable `USE` | 1 | Refused before restore; destination had 0 tables |
| Interrupted restore shim after first table | 1 (shim 42) | One table left; subsequent retry exited 1 |
| Wrong destination / populated retry | 1 each | Refused |
| Fresh disposable recovery destination | 0 | PASS |
| Invalid FK insert / audit UPDATE / audit DELETE | 1 each | Rejected by restored database |

The restore compared all per-table row counts and SHA-256 content digests, nine pinned ledger hashes, 15 InnoDB tables, four audit triggers, and 23 foreign-key columns. A fresh client session reported `@@foreign_key_checks=1` and `@@autocommit=1`. The MariaDB CLI commands supplied `--no-defaults` first. The original `scripts/mariadb-migration-runner.cjs` SHA-256 remained `552dc45fd06f2cdf769496f3d2648f857f39dd0643c06975ab5bb78775d0d01d`.

## Scope and remaining gates

The parser accepts only the observed MariaDB 11.8 table, insert, trigger and bounded session statement forms. Its acceptance is specific to this migration inventory and dump options. Production metadata compatibility, privilege review, backup retention and restore ownership, staging authenticated security tests, and explicit production change approval remain unverified here. No production connection, Hostinger change, GitHub Actions run, PR, merge, deployment, publishing or automation activation occurred.
