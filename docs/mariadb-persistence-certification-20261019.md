# GrowthOS independent persistence certification 19 October 2026

Verdict: **LIVE DATABASE CERTIFICATION BLOCKED. Production HOLD / NO-GO.** The additive migration and real-database harness are prepared and checked offline. No MariaDB server, database command, schema installation, grant, Docker resource, provider request, publishing action or automation was executed in this certification run.

## Lineage and scope

Branch: `certification/growthos-mariadb-20261019`, created in isolated worktree `/workspace/scratch/886c85eece52/growthos-db-certification` from verified integration HEAD `ae1ccce603f7080c44e0c2025b00ce62105e8888`. Both Work A `9bb1a1c5de3b70b7c9279e22dbbbc1efc57d9ea5` and Work B `41615f07510aa04952472571fd8030c2790c82b3` were verified as ancestors with `git merge-base --is-ancestor` (exit 0 each). Their common baseline remains `cb64d063e067bf513513359f8242c4ed9218c364`. No merge or source-branch update was performed.

Prepared code commit in GitHub: `ec73ed9ff2ea308afc048b62bd06cc391401e21a`, parent `ae1ccce603f7080c44e0c2025b00ce62105e8888`. Locally checked equivalent commit: `2479e9a22368a21bd4e7edebc625e0fc8db80846`. Both have tree `cba2a30ed315ec4743c5847acbc046e84886f8a6`. This report is a documentation-only child commit of that code.

Authoritative review inputs: `docs/product-engine-integration-evidence-20261018.md`, `docs/work-b-persistence-schema-proposal-20261018.md`, `docs/disposable-dump-validator-certification-20261017.md`, and the attached Complete Master Blueprint & Architecture Bible (SHA-256 `1a04e0a2afae7545740948aeaadb876c0f972f5ae7720128ec2b662354ce8a92`), especially sections 39, 42, 49 and 51. Earlier Node 22/MariaDB restore evidence is historical evidence from a different environment, not execution evidence for this candidate.

## Environment and fail-closed outcome

`node --version` returned `v24.19.0` (exit 0). `command -v node22`, `command -v docker`, `command -v mariadbd` and `command -v mariadb` found no executable on PATH. A verified Node 22 runtime, usable local Docker isolation and disposable MariaDB 11.8 therefore were unavailable. No existing database credential values were inspected or accepted.

`node scripts/certify-content-persistence.cjs --run` exited **2**, printing `REFUSED: Node.js 22 required; no infrastructure or database access attempted`. This is an expected preflight refusal, not a database test failure or PASS. Offline refusal tests additionally intercept child-process spawning and prove that a refused run starts no infrastructure process. The harness generates fresh synthetic credentials only after all non-database preflight checks; no credentials were generated or used by the refused live run.

## Additive migration review

Candidate: `database/proposals/010_content_persistence_candidate.sql`.

SHA-256: `bb10b32ec0186399ae10b1820541d4330aab500843cd0fcf2a82b4da515c2c5b`.

010 is a **provisional review number** outside `database/mysql`; it is not registered with the certified migration runner. The candidate has 13 framed statements: five CREATE TABLE, one additive ALTER TABLE index, and seven CREATE TRIGGER. No existing migration file changed. A successful future disposable installation would record one new ledger entry only after every candidate DDL statement succeeds. DDL commits implicitly: failure leaves a partial schema and must not be resumed. The harness models abandonment of a partial disposable schema and recovery into a separately created empty one.

| Table / dependency | Keys and scope | Review conclusion |
| --- | --- | --- |
| `growth_content_records` | PK `(organization_id,website_id,id)`; composite FK to certified website scope | JSON scope, id, version, stage and event array must mirror SQL identity; stage enum matches the lifecycle contract. SQL parsing/enforcement BLOCKED. |
| `growth_content_events` | Scoped event PK; unique `(organization_id,website_id,content_id,version)`; three-column content FK | Retains actor, operation, time and result snapshot; JSON scope/version checks; UPDATE/DELETE guards proposed. |
| `growth_connector_health` | PK `(organization_id,website_id,channel)`; two-column site FK | Explicit unknown/disconnected/unavailable/verified states and checked/expiry timestamps. Expiry must exceed check time. Trusted probe ingestion remains an application release blocker. |
| `growth_publication_claims` | Scoped content/channel PK; unique `(organization_id,claim_hash)`; three-column content and reservation FKs | Insert must start unknown; immutable identity and creation time; only unknown → confirmed/absent; no DELETE, terminal reset or terminal rewrite. Provider-field consistency enforced by CHECK. |
| `growth_publication_observations` | Unique `(organization_id,issuer,event_id)`; four-column claim FK | JSON envelope scope/issuer/event must mirror SQL; append-only UPDATE/DELETE guards; payload hash supports application replay detection. |
| `growth_ai_reservations` | Proposed new unique `(organization_id,website_id,id)` | Existing globally unique id remains; additive index permits a tenant/site-bound reservation FK. No certified file or UTC accounting behavior changed. |

All new tables specify InnoDB/DYNAMIC. Parent identifiers are CHAR(36) with `utf8mb4_uca1400_ai_ci`; content/event identifiers use `utf8mb4_bin`, and channel/hash columns use `ascii_bin`. FK column charsets/collations match their proposed parents. This candidate deliberately requires the observed MariaDB 11.8 collation and 16KiB pages; the live harness verifies parent column collation/length and page size before DDL. It is not portable certification for a production database with unknown metadata.

Modeled maximum indexed bytes: content PK 800; content-event PK 1312; content-version unique key 808; connector PK 368; scoped reservation key 432; claim PK 880; claim-hash key 208; observation PK 1168. These are below 3072 bytes at the selected character widths and page size. Actual indexed widths, syntax, collations, row format and optimizer behavior remain BLOCKED pending MariaDB execution.

| Inventory | Certified baseline | Candidate addition | Expected expanded inventory, unexecuted |
| --- | ---: | ---: | ---: |
| InnoDB tables including ledger | 15 | 5 | 20 |
| Immutable/claim triggers | 4 | 7 | 11 |
| FK columns | 23 | 17 | 40 |
| Migration ledger entries | 9 | 1 | 10 |

The four original triggers remain `approval_audit_update_guard`, `approval_audit_delete_guard`, `growth_feature_audit_no_update` and `growth_feature_audit_no_delete`. Their source bytes and migration hashes were checked offline; their existing runtime certification was not repeated.

## Locking, authorization and audit review

The application claim path locks organization budget → website → content → claim → content policy → connector evidence → reservation. Budget reservation also serializes under the same organization row. Reconciliation locks content → claim and writes observation, content event, content CAS and claim status in a single transaction. Generic content updates lock the scoped content row and cannot persist provider-status events. The candidate installer takes a schema advisory lock before checking inventory and applying DDL. Deadlocks are explicit failures; neither application path nor harness silently retries a non-idempotent action.

A future live test uses two independent mysql2 pools and asserts distinct `CONNECTION_ID()` values. A separate deliberately inverted pair of locks checks the server's deadlock-victim behavior and rollback. The interrupted-transaction test disconnects a session after content and audit writes but before COMMIT, then checks that neither change persisted and the same event can recover safely.

Composite FKs prevent mismatched organization/site references; they do not implement RBAC or row-level authorization. A shared runtime database principal can read its granted tables across organizations. Membership authorization must remain at the authenticated server boundary. This harness tests adapter scoping and database privileges, not authenticated HTTP or website-specific entitlements. The internal-approval-to-content/version/destination bridge remains unresolved.

The prepared grants give the content writer SELECT on site/budget/policy/reservation/connector evidence; SELECT/INSERT on records and both journals/claims; UPDATE only `(version,stage,record_json)` on records and `(status,provider_id,publication_url)` on claims. It gets no DELETE, DDL, GRANT, connector-health write or installer privilege. The independent reader gets SELECT only on the five new tables. Tests attempt prohibited schema, audit and identity writes. Synthetic installer DML additionally tests that triggers defend even when an account has broader UPDATE/DELETE privileges. A database administrator able to drop triggers/tables is outside that immutability guarantee.

## Prepared executable live checks — none executed

`scripts/content-persistence-mariadb-tests.ts` contains **17 grouped live checks**, all currently **BLOCKED**:

1. Expanded table/trigger/FK/ledger inventory and pinned hashes.
2. Two-session publication claim uniqueness, atomic unknown status and raw duplicate-key refusal.
3. Two-session optimistic content CAS.
4. Tenant/site boundaries, viewer denial, approval-event replay and cross-tenant reservation FK refusal.
5. JSON scope mirrors and initial claim-state constraints.
6. Stale connector evidence refusal.
7. Claim/content rollback when audit insertion fails.
8. Signed reconciliation, exact replay, conflicting replay, expiry, forged signatures and duplicate claims.
9. Reconciliation failure rollback and recovery.
10. Verified absence remains terminal; signed foreign scope is denied.
11. Audit UPDATE/DELETE refusal for both new journals.
12. Claim identity, creation time, deletion, terminal reset and terminal rewrite refusal.
13. Least-privilege writer and reader grants.
14. Interrupted transaction rollback and same-event recovery.
15. Two-session deadlock victim and rollback without automatic retry.
16. Partial/completed installation retry refusal and recovery into a fresh schema.
17. Certified backup/restore refuses expanded inventory before invoking clients; destination stays empty.

Temporary failure-injection triggers are created only inside the owned future test container and removed within each test. No certified trigger is replaced. Fixture feature flags represent in-memory/test-schema conditions only; no application server, publisher, queue, scheduler or provider is started by the harness.

## Backup, migration and recovery compatibility

**FAIL compatibility review:** the certified restore contract expects 15 tables, four triggers, 23 FK columns and nine ledger entries. The candidate would produce 20/11/40/10 and adds JSON CHECK expressions, DATETIME(6), binary collations and conditional trigger bodies outside the certified dump grammar. The certified executor similarly installs exactly 001–009 into an empty schema. Neither contract can certify the expanded schema as-is.

**PASS fail-closed offline check:** passing a new content table to the existing dump validator is refused as an unexpected table. No parser allowlist, CLI default suppression, restore destination guard, migration pin or retry safeguard was relaxed. No backup or restore was executed. Expanded-schema backup/restore requires a separately reviewed contract and genuine populated restore certification before release.

Pinned unchanged safeguard hashes:

| File | SHA-256 |
| --- | --- |
| `scripts/mariadb-migration-runner.cjs` | `552dc45fd06f2cdf769496f3d2648f857f39dd0643c06975ab5bb78775d0d01d` |
| `scripts/production-migration-executor-candidate.cjs` | `b4c400d8cab3a2cb567ca7ad09b6d8e0c82c6bfb9f1668b03d821e6381d60a35` |
| `scripts/disposable-dump-guard.cjs` | `dbbc671269ac94abb6b5e81bec5e1577bf101cfc2519630eeef230b6dc12f25c` |
| `scripts/disposable-backup-restore-rehearsal-candidate.cjs` | `68df737dd6d1d8bb7bb40c1074ccbf8fe9b39e839adfb9253f51d28a3a3c6133` |

## Nine independently checked certified migration hashes

| Migration | SHA-256 |
| --- | --- |
| 001_core_schema.sql | `b67ab03511cd972ee07f7e891d35134e84c0e0ac00ff8f27614f5fcf479108c6` |
| 002_budget_incidents.sql | `2b5d77e9120b23debd57f39439ceee3fafee7b46c1c5c26c22c1597aebddab2e` |
| 003_sessions.sql | `c2bcabc28b3c26827ea0e1f5e01b6e6c0ce0c7d9797f6c5ed9c4c60150b0b4c7` |
| 004_login_throttles.sql | `4bf0afc1e375720abaadf5b3bc282ed0b7d5c83cd56e58f37b3b557133f1c179` |
| 005_installation_state.sql | `4c020458375497ba0808a65ac76baaa839c13697de054608f5c42556ad14919b` |
| 006_approval_queue.sql | `763ee4dd6b9461a799bffc1f314bc0ff69bc6dd84a52f9e96841342051f01019` |
| 007_approval_audit.sql | `8f4fd143f23761e62f381cfcb736efe9380159bb786be07f46e9cee3d28add6f` |
| 008_approval_audit_guards.sql | `7ad741a87d29157ed1236aacd9daef1f855b5c38f2351bb5e5cf9e305502c672` |
| 009_website_feature_audit.sql | `b8d26a4f7f9ce93407d3a3a5c63415bf3ca32a1843275ef5a3b99ba8ff15285c` |

Ledger DDL SHA-256 remains `4a20c75d96d31f23aba12256175ba927fbd2476321b8e49f3d393c5f188419ee`. The new package independently pins these nine hashes, ledger and original runner; candidate bytes are separately pinned. Modified candidate bytes are rejected before SQL or infrastructure access.

## Commands actually executed

All checks below ran sequentially with Node **24.19.0** and existing dependencies linked from the prior worktree. They are supplementary offline checks, not Node 22 parity or MariaDB certification. No `npm ci`, dependency download or paid build was performed.

| Command | Exit | Actual result |
| --- | ---: | --- |
| `git fetch origin integration/growthos-product-engines-20261018` | 0 | Fetched requested integration SHA. |
| `git merge-base --is-ancestor 9bb1a1c5de3b70b7c9279e22dbbbc1efc57d9ea5 FETCH_HEAD` | 0 | Work A preserved. |
| `git merge-base --is-ancestor 41615f07510aa04952472571fd8030c2790c82b3 FETCH_HEAD` | 0 | Work B preserved. |
| `git worktree add -b certification/growthos-mariadb-20261019 /workspace/scratch/886c85eece52/growthos-db-certification FETCH_HEAD` | 0 | New isolated branch. |
| `node --check scripts/certify-content-persistence.cjs` | 0 | Wrapper syntax. |
| `node --check scripts/lib/content-certification-package.cjs` | 0 | Package/guard syntax. |
| `node --check scripts/test-content-certification-offline.cjs` | 0 | Offline-test syntax. |
| `node scripts/test-content-certification-offline.cjs` | 0 | Seven grouped package/refusal checks; zero database behavior certified. |
| `node scripts/certify-content-persistence.cjs --plan` | 0 | Pinned offline plan, expected inventory only. |
| `node scripts/certify-content-persistence.cjs --run` | 2 | Expected Node 22 refusal before infrastructure/database access. |
| `node scripts/verify-production-migration-package.cjs` | 0 | Certified source package unchanged. |
| `node scripts/production-migration-executor-candidate.cjs --plan` | 0 | Existing nine-migration plan unchanged. |
| `npm test` | 0 | 252 tests: 251 passed, one existing skip. Includes previously modeled SQL tests, not MariaDB execution. |
| `npm run typecheck` | 0 | Includes the new live worker's TypeScript. |
| `npm run build` | 0 | Next.js production compilation. |
| `npm run test:security:offline` | 0 | Offline source security checks. |
| `npm run test:db-guards:offline` | 0 | Eight refusals; no connection authorized. |
| `npm run test:mutation-security:offline` | 0 | 52 mocked assertions. |
| `npm run test:auth-cookies:offline` | 0 | Five mocked cookie cases. |
| `node scripts/test-feature-route-mocked.cjs` | 0 | Ten mocked feature/security cases. |
| `git diff --check` | 0 | No whitespace errors. |
| `git diff --exit-code ae1ccce603f7080c44e0c2025b00ce62105e8888 -- database/mysql scripts/mariadb-migration-runner.cjs scripts/production-migration-executor-candidate.cjs scripts/disposable-dump-guard.cjs scripts/disposable-backup-restore-rehearsal-candidate.cjs staging compose.mariadb-test.yaml .github/workflows` | 0 | Empty diff; certified files, staging and workflows preserved. |

One initial typecheck exited 2 because Next.js types require NODE_ENV in the new child-process environment objects. The worker now supplies `NODE_ENV=test`; the final typecheck, unit suite and build passed. No final executed offline check is failing. No SQL syntax/locking/grant/trigger assertion was executed against MariaDB.

## Future execution requirements

A suitable environment needs Node.js 22, the existing locked npm dependencies, permission to use the local Docker socket `/var/run/docker.sock`, and a **preloaded** official MariaDB 11.8 image referenced as `mariadb@sha256:<reviewed digest>`. No image digest is invented here. The harness uses `--pull=never` and never calls a paid or remote infrastructure API. No socket escalation is requested. A missing/inaccessible socket or unavailable image is a blocker.

In a clean isolated environment with no inherited database/backup/production or remote Docker configuration, the future commands are:

```sh
node scripts/certify-content-persistence.cjs --plan
# Set GROWTHOS_CERT_MARIADB_IMAGE to the independently reviewed, preloaded image digest.
GROWTHOS_CERT_DISPOSABLE=YES node scripts/certify-content-persistence.cjs --run
```

The live wrapper generates random synthetic credentials; creates an owned internal network and a single tmpfs database container with only a host-loopback database port; inspects labels, image digest, mounts, capabilities, namespaces, network membership and port binding; then passes transient configuration to the worker over stdin. The worker independently repeats Docker provenance checks and verifies database version/hostname before creating its generated `growthos_test_cert_*` schemas. The server listens only inside that container network; the published host endpoint is 127.0.0.1. No caller database name or credential is accepted. The wrapper tears down only its owned container/network and private credential file afterward. Do not interpret the prepared harness as executed infrastructure evidence.

Remaining BLOCKED gates: actual Node 22 and MariaDB execution of all 17 groups; independent migration/trigger/grant approval; expanded-schema backup/restore certification; real provider/connector attestation and approval mapping; section 49 timezone/chargeable/refund accounting; isolated authenticated staging; and all independent production release gates. GrowthOS stays **HOLD / NO-GO**.
