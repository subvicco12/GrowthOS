# Growth OS — local isolated MariaDB 11.8 test procedure

**Not yet executed.** Requires a machine with Docker Compose, Node.js and installed project dependencies. No GitHub Actions required; no Hostinger credentials or production access.

1. Clone/check out `feat/ci-cost-guardrails-20261011`. Set strong **local-only** environment variables `GROWTHOS_LOCAL_TEST_PASSWORD` and `GROWTHOS_LOCAL_ROOT_PASSWORD`. Do not commit or paste these values.
2. Start: `docker compose -f compose.mariadb-test.yaml --profile local-test up -d --wait`.
3. Set `GROWTHOS_DB_HOST=127.0.0.1`, `GROWTHOS_DB_PORT=33317`, `GROWTHOS_DB_USER=growthos_test`, `GROWTHOS_DB_PASSWORD` to the local test password, `GROWTHOS_DB_NAME=growthos_test_local`, and `GROWTHOS_MIGRATION_TEST_DISPOSABLE=YES`.
4. Run `node scripts/check-mariadb-parser.cjs`, then `node scripts/mariadb-migration-runner.cjs --test-disposable`.
5. Capture output including `SELECT VERSION()` confirmation, migration ledger, InnoDB table count, foreign keys, and audit trigger functional results. A PASS is valid only if the process exits 0.
6. Stop and discard ephemeral database: `docker compose -f compose.mariadb-test.yaml --profile local-test down`.

**Safety:** The test runner refuses production DB name and only accepts `growthos_test_*`. The compose file binds port 33317 to localhost and uses a tmpfs data directory. Never use real Hostinger credentials or production SQL exports in the disposable test. If tests fail, stop, inspect error, then recreate the test container; do not rerun against a partially initialized schema.

**Known limitations:** Image tag `mariadb:11.8` tracks the 11.8 series, not necessarily the exact Hostinger 11.8.9 patch. Verify the reported version. No production installation should be approved until exact compatibility, backup/restore and live read-only inventory have been checked.
