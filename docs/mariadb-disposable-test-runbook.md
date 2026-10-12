# MariaDB migration ledger and isolated validation

**Status: local execution attempted; socket restrictions blocked runtime validation.** See `isolated-mariadb-readiness-20261012.md`. These scripts have not been deployed or used against Hostinger.

## Read-only plan
From repository root:
```sh
node scripts/mariadb-migration-runner.cjs
```
Prints nine migration filenames, SHA-256 checksums, and intended objects. Does not load mysql2 or connect to a server.

## Isolated MariaDB validation (only in an existing, empty, disposable local test database)

Prerequisites: MariaDB 11.8.x server, Node.js, mysql2 installed from project dependencies, test-only DB user and an **empty database** named `growthos_test_<suffix>`. The script does not create, drop or clean up the database.

Set `GROWTHOS_DB_HOST`, `GROWTHOS_DB_PORT`, `GROWTHOS_DB_USER`, `GROWTHOS_DB_PASSWORD`, `GROWTHOS_DB_NAME=growthos_test_<suffix>`, and `GROWTHOS_MIGRATION_TEST_DISPOSABLE=YES`. Then run:
```sh
node scripts/mariadb-migration-runner.cjs --test-disposable
```
The runner checks the test schema is empty and the server identifies as MariaDB; installs the ledger; applies migrations 001–009 in order; records hashes; and checks all nine ledger entries. **A failed migration can leave partial DDL. Discard the disposable database through the test environment's normal controls; never retry blindly.**

## Limits and next gates

- This is a disposable **test-only** runner, **not a production installer**. Its `growthos_test_*` name gate deliberately prevents use with Hostinger's prefixed production database.
- It does not compare the live database schema or automatically roll back DDL.
- It checks table engines, the four audit triggers, foreign-key inventory, and functional audit immutability/FK rejection. It does not assert every expected column, index, or concurrent transaction correctness. The approval integration suite must pass separately before production approval.
- Run `database/mysql/000_read_only_preflight.sql` on the actual Hostinger database through an authorized read-only interface, compare with the export, and verify backup/restore readiness.
- No production SQL, database changes, merges, deployments, DNS edits, or spending without explicit separate approval.
