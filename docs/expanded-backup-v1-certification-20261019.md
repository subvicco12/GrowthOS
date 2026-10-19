# GrowthOS expanded backup v1 certification evidence

**Prepared and verified offline; real MariaDB backup/restore certification BLOCKED. Production HOLD / NO-GO.** No database connection, SQL execution, Docker resource, live provider request, publishing or automation activation occurred. The visible request ended at “Verify refer”; this implementation includes the requested archive, scope, counts, hashes and referential-integrity checks.

Branch: `certification/growthos-expanded-backup-20261019`. Verified source HEAD: `e5b2c9678bb57817ba6a18e0f85df681f8c4e8e6`, fetched from `certification/growthos-mariadb-20261019`. Code commit in GitHub: `9027fb0a3dcc03fb3e87706c0936acc9483c5c22`, parent the verified source. Equivalent checked local commit: `1b4371fe14576e0eec81668aeaba0073e07d8c3c`. Matching implementation tree: `f33683f231e08818238549d5bfe8c8cc7ee1d57c`. This report is a documentation-only child of the code commit.

The source's persistence certification, integration evidence, schema proposal and 17 October dump certification documents were used as the review baseline. The supplied Master Blueprint remains binding for tenant scope, audit integrity, recovery, disabled defaults and independent release gates. No source branch, database migration, existing recovery tool, staging file, workflow or application route was changed.

## Separate versioned contract

Files added:

- `scripts/lib/expanded-backup-v1.cjs`: frozen schema contract, archive authentication, metadata/scope/FK/unique-key validation, deterministic snapshot and guarded restore.
- `scripts/certify-expanded-backup-v1.cjs`: plan and disposable-only rehearsal entry point.
- `scripts/expanded-backup-v1-mariadb-tests.ts`: future genuine populated source/reference/destination/recovery tests.
- `scripts/test-expanded-backup-v1-offline.cjs`: ten grouped offline archive/security tests.

Format `growthos-expanded-backup-v1` uses a canonical JSON archive (`.gx1`), **not general mariadb-dump SQL input**. Its signed payload contains 32 exact approved DDL statements, independently captured schema metadata, and typed table rows. SQL schema statements must equal the frozen local reviewed statements byte-for-byte; row values use prepared INSERT parameters and are never parsed as SQL. Native dumps and client commands are unsupported and refused. This narrow grammar satisfies the executable-comment refusal requirement without changing the certified MariaDB dump interpreter.

Frozen v1 contract SHA-256: `17ce94be57e677190522341bf011195eba889938a89ec83cce99d8a589e17786`.

Proposed migration 010 remains unchanged, SHA-256 `bb10b32ec0186399ae10b1820541d4330aab500843cd0fcf2a82b4da515c2c5b`. The v1 model separately pins all nine certified hashes plus candidate 010 through the unchanged certification package. `--plan` reports every exact hash and table/trigger name. No candidate migration was installed or promoted to `database/mysql`.

| Required inventory | v1 contract | Actual MariaDB execution |
| --- | --- | --- |
| Tables | Exactly the certified 15 plus `growth_content_records`, `growth_content_events`, `growth_connector_health`, `growth_publication_claims`, `growth_publication_observations` | BLOCKED |
| Engine and table collation | 20 InnoDB tables, `utf8mb4_uca1400_ai_ci`; column collations and row formats compared independently | BLOCKED |
| Triggers | Original four plus candidate seven, exact pinned definitions | BLOCKED |
| FK columns | Exactly 40, no cross-schema references | BLOCKED |
| Ledger | Exactly ten entries with all reviewed hashes | Passed synthetic archive validation; database execution BLOCKED |

## Authentication, SQL and metadata validation

An archive needs an independently supplied 32-byte HMAC key. Its canonical envelope authenticates both the payload digest and bytes with HMAC-SHA256; malformed UTF-8, changed bytes, noncanonical encodings, duplicate JSON keys, unknown fields and wrong keys are refused. Per-table row counts and SHA-256 digests are recomputed independently. SHA-256 alone is not presented as protection against deliberate tampering.

Only the exact pinned CREATE TABLE, CREATE TRIGGER and single additive reservation-index DDL are accepted. Executable comments, USE/database switching, qualified object statements, DROP/TRUNCATE, routines, arbitrary INSERT SQL, session changes, DELIMITER/SOURCE and shell/client directives in the executable statement stream all fail before database access. Content containing SQL-looking text remains literal bound data. There is no executable SQL or destination identifier interpolated from archive rows.

Metadata must match a separately installed clean reference schema in the owned disposable container. It includes table engine/row format/collation, column type/default/nullability/extra/charset/collation/generation, indexed columns/order/uniqueness/prefix/type/collation, FK columns and update/delete rules, trigger body/event/order/timing/SQL mode/connection collation, and CHECK definitions. All references must remain within the verified schema; routines and scheduled events are forbidden. Source trigger definers are not imported: the frozen DDL has no caller-controlled DEFINER and creates triggers under the trusted disposable installer account. This is a test-only restore contract, not a production privilege migration.

Archive column names/order come from the frozen DDL, not untrusted SQL. Unique-key and all FK tuples are checked before restore, then the real database must independently enforce constraints. Source/destination names must be distinct `growthos_test_*` identities. The actual connection's DATABASE(), MariaDB 11.8 version, charset/collation, page size, FK/check enforcement and autocommit are independently checked. A destination must have no tables/views, triggers, routines or events. An advisory lock protects the empty check and restore. No USE statement selects a database from archive text.

## Scope and deterministic content preservation

Content and event JSON must match organization, website, content identity and version; record stage must match its SQL projection. Claims must refer to a reservation and content record in the same organization/site and have coherent unknown/absent/confirmed state. Confirmed content must retain the same observed provider identity and URL. Observation envelopes must match their organization/site/content/channel/issuer/event columns and an existing scoped claim. Connector expiry must remain after its recorded check time; stale/disconnected evidence is preserved, not refreshed into healthy status.

Rows are serialized in fixed column order, sorted by canonical UTF-8 row bytes and hashed, preserving SQL NULL, numeric strings, Unicode and microsecond date strings. The driver uses UTC, dateStrings and exact big-number strings. Counts and content digests cover every table, including empty tables. The archive is bounded to 32 MiB and 100,000 aggregate rows; larger workloads require a separately reviewed format. The snapshot uses one consistent transaction and checks schema metadata before/after. The supported rehearsal owns the container and runs no application workers or other writers; this is not certification of concurrent operational backup under arbitrary DDL.

## Restore and recovery behavior

The complete archive is authenticated and validated before any database call. The verified empty destination receives only pinned DDL. All data rows are then inserted in FK dependency order within one transaction; neither foreign_key_checks nor audit triggers are disabled. Terminal claims are inserted as unknown with their original identity/time, then advance exactly once to the archived confirmed/absent state with an affected-row check. No preexisting claim is reset, overwritten, replaced or deleted.

Audit records/observations use INSERT only. CHECKs, FKs and all eleven triggers remain installed. A final independent metadata comparison and per-table count/hash round trip are required before RESTORE_VERIFIED is returned; FK/check enforcement and autocommit are checked again.

DDL commits implicitly. An interrupted restore may leave a partial schema; failed data insertion rolls back its transaction but leaves schema objects. Either outcome makes the destination nonempty, so retry is refused. Recovery uses another independently verified empty disposable schema. No cleanup SQL, destructive reset or automatic retry is available in the library.

## Prepared genuine database rehearsal — all four groups BLOCKED

The new entry point preserves the source harness's Node 22 gate, explicit opt-in, CI refusal, inherited-credential refusal, local Docker socket requirement, preloaded digest-pinned image, owned labels, internal single-container network, tmpfs-only database storage and host-loopback port checks. The worker repeats provenance checks before connecting. Credentials and the archive key are freshly generated synthetic values; no caller database or production credential is accepted. No image is pulled and no paid service is used.

The future worker installs the certified baseline and pinned candidate in its generated source, independently installs a clean reference, and populates two synthetic organizations and sites. It includes the same content identifier in both tenants, terminal claims, audit events, signed synthetic observations and expired/disconnected connector evidence. Websites retain draft/disabled/zero-budget defaults. No publisher, application, queue or scheduled automation starts.

Planned groups, **not executed**:

1. Write/read a private 0600 archive in a 0700 temporary directory and genuinely restore populated data; compare all 20 table digests/counts, schema metadata, tenant scopes and terminal states.
2. Refuse corrupted bytes, source-as-destination, and populated retries; confirm corrupted input leaves the destination empty.
3. Interrupt DDL after one table, refuse retry, then recover into a new destination.
4. Prove restored FKs, both new immutable journals and terminal claim protections still reject forbidden operations; verify restored session safeguards.

The temporary archive and ephemeral HMAC key are for one disposable rehearsal. Durable key custody, encrypted operational storage, retention, ownership, RPO/RTO and disaster-recovery execution remain separate release gates. No actual backup file was created in this environment because the live gate refused execution.

## Executed evidence

Runtime: Node **24.19.0** with preinstalled dependencies linked from the existing worktree. The previous environment assessment remains applicable: Node 22, Docker and MariaDB were unavailable. Failed infrastructure discovery was not repeated. No full application suite or old restore certification was repeated because no existing application/database safeguard file changed.

| Command | Exit | Result |
| --- | ---: | --- |
| `git fetch origin certification/growthos-mariadb-20261019` | 0 | Requested source HEAD verified. |
| `git worktree add -b certification/growthos-expanded-backup-20261019 /workspace/scratch/886c85eece52/growthos-expanded-backup FETCH_HEAD` | 0 | Isolated branch created. |
| `node scripts/certify-content-persistence.cjs --plan` | 0 | Existing certified/candidate pins verified without database access. |
| `node --check scripts/lib/expanded-backup-v1.cjs` | 0 | Syntax passed. |
| `node --check scripts/certify-expanded-backup-v1.cjs` | 0 | Syntax passed. |
| `node --check scripts/test-expanded-backup-v1-offline.cjs` | 0 | Syntax passed. |
| `node scripts/test-expanded-backup-v1-offline.cjs` | 0 | Ten grouped offline checks passed. |
| `node scripts/certify-expanded-backup-v1.cjs --plan` | 0 | Frozen 20/11/40/10 contract plan; no SQL executed. |
| `node scripts/certify-expanded-backup-v1.cjs --run` | 2 | Expected refusal: Node 22 required, before infrastructure/database access. |
| `node scripts/verify-production-migration-package.cjs` | 0 | Original nine-migration package unchanged. |
| `npm run typecheck` | 0 | Includes the new live worker; final rerun passed. |
| `npm run test:security:offline` | 0 | Offline source checks passed. |
| `git diff --check` | 0 | No whitespace errors. |
| `git diff --exit-code e5b2c9678bb57817ba6a18e0f85df681f8c4e8e6 -- database scripts/mariadb-migration-runner.cjs scripts/production-migration-executor-candidate.cjs scripts/disposable-dump-guard.cjs scripts/disposable-backup-restore-rehearsal-candidate.cjs scripts/content-persistence-mariadb-tests.ts scripts/certify-content-persistence.cjs scripts/lib/content-certification-package.cjs staging .github/workflows` | 0 | Empty diff; every listed baseline/proposal/safeguard preserved. |

Two in-progress offline runs failed because their fixture mutated an already-empty metadata array and shared the model DDL array with a negative test. Fixtures were corrected; the final ten groups passed. The column extractor was also corrected to retain BOOLEAN fields before freezing the reviewed v1 hash. These are development fixes, not database execution evidence.

Unchanged safeguard SHA-256 values remain: migration runner `552dc45fd06f2cdf769496f3d2648f857f39dd0643c06975ab5bb78775d0d01d`; certified dump guard `dbbc671269ac94abb6b5e81bec5e1577bf101cfc2519630eeef230b6dc12f25c`; certified restore rehearsal `68df737dd6d1d8bb7bb40c1074ccbf8fe9b39e839adfb9253f51d28a3a3c6133`.

For a future permitted local environment, supply the reviewed preloaded MariaDB image digest through `GROWTHOS_CERT_MARIADB_IMAGE`, then use `GROWTHOS_CERT_DISPOSABLE=YES node scripts/certify-expanded-backup-v1.cjs --run` under Node 22. The existing 15-table SQL dump validator continues to refuse expanded dumps. New v1 code does not supersede that certification, authorize schema installation elsewhere or certify production recovery. GrowthOS remains **HOLD / NO-GO**.
