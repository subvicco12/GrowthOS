# GrowthOS authorization issuance and connector trust evidence

Execution date: **2026-10-20**; requested branch/document date retained as 20261019. **Production HOLD / NO-GO.** Application components and synthetic/offline checks PASS. Production wiring, Node 22, MariaDB, independent durable-anchor infrastructure, grants and authenticated staging remain BLOCKED. No provider, publisher, worker or automation was activated.

## Verified lineage and implementation

Created `feat/growthos-authorization-trust-20261019` from exactly `88e11d23d26d61759d551bfeab5ab7920b6649de` on `feat/growthos-approval-connector-bridge-20261019`.

All four remote heads were fetched and compared with the requested SHA in FETCH_HEAD:

| Read-only reference | Verified SHA |
| --- | --- |
| Primary approval bridge | `88e11d23d26d61759d551bfeab5ab7920b6649de` |
| MariaDB persistence | `e5b2c9678bb57817ba6a18e0f85df681f8c4e8e6` |
| Expanded backup | `3e7d7622cb672beb6025a146cae2396baa3cc063` |
| Quota/settlement | `bd4d08c36b4c2c0d2a909d42377be048e9779d47` |

Primary, MariaDB and quota histories diverge at `ae1ccce603f7080c44e0c2025b00ce62105e8888`; expanded backup descends from the pinned MariaDB head. Source branches were not updated, merged or reset. Related code/documents were inspected with `git show`, not installed or merged.

Verified implementation commit: **`2b8eafb62503c99e5698065f25c8ad0bce2fa4ff`**. Tree `3f0174c7667d35cd4462566b163f8c3d28f3e1c9` equals locally tested commit `c5bdd1248400eccacda7d167799e5dc728e3174e`. Git Data transfer recreated metadata with the same primary parent and identical tree. This report is a documentation-only child; the final branch SHA is reported in the completion response and obtainable with `git rev-parse HEAD`.

Read the requested approval/connector and integration documents, actual 010 SQL/persistence evidence, expanded-backup-v1 code contract/evidence and quota/settlement implementation/proposal. Read relevant requirements in the supplied Master Blueprint, SHA-256 `1a04e0a2afae7545740948aeaadb876c0f972f5ae7720128ec2b662354ce8a92`: explicit approval, scoped accounts, least privilege, signed evidence/revocation, zero defaults, reserved/chargeable accounting and independent verification. No full-blueprint or live certification is claimed.

## Completed application components

| Component | Implemented behavior | Actual certification limit |
| --- | --- | --- |
| Explicit issuance | `PublicationAuthorizationIssuer` validates explicit consent and reviewed content/version/hash, policy hash, destination revision/target, scoped completed reservation, durable content approve event/snapshot and current requester/approver owner/admin membership. Session-derived actor; no actor/role/digest accepted in JSON. Five-minute maximum issuance lifetime bounded by session expiry. | PASS synthetic; no real HTTP session or MariaDB used. |
| HTTP boundary | Strict canonical Host/Origin and existing bounded/fatal-UTF8 JSON helper; duplicate/malformed cookies refused; server hashes the actual session token and treats selected-org cookie as a resource requiring membership. Structured 400/401/403/404/409/503 errors and no-store responses. | Injectable handler tested with synthetic requests. Actual route remains explicitly wired to unavailable/503, never mock success. No preview/consent UI or runtime principals provisioned. |
| Issuance/revocation persistence | Dedicated SQL issuer adapter locks org/site/session/member/content/policy/destination/reservation and verifies the existing approval bridge before INSERT; issuance/revocation audit shares the transaction. Unique approval/request keys; consumed/revoked states cannot reset. Revocation still works under shutdown but requires current session/role. | PASS mocked persistence/rollback. SQL syntax, isolation, FKs, triggers and actual grants BLOCKED. |
| Connector ingestion | Server-owned copied registry/key/capability configuration, existing base HMAC plus v2 control HMAC covering generation, sequence, previous hash and signed envelope. Freshness, scope, destination, explicit capabilities and current trust required. Valid negative probes may be stored but never authorize publishing. No network/probe collection is performed. | PASS synthetic signatures/protocol. Registry provisioning and real provider attestation remain absent. |
| Independent anti-rollback | Required external monotonic anchor; durable pending-before-SQL protocol; append-only history/current readback; only exact-envelope recovery; no clearing pending on failure. SQL restore cannot lower an independent checkpoint or resurrect a revoked key. Key revocation persists before audit, so audit failure leaves it revoked. | PASS modeled independent-anchor tests. No production anchor backend exists; an in-memory/SQL anchor is not silently substituted. |
| Claim lease and controls | Whole issuance/claim SQL transaction must execute inside the external key lease, acquired before SQL locks. Checkpoint is unusable after callback. Existing publication authorization boundary now defaults to denial without checkpoint AND current execution guard; guard rechecks the boundary time. | PASS synthetic default-denial and time tests. Durable quota-v2/publication funding adapter still missing. |
| SQL connector writer | Dedicated principal adapter atomically appends unique history, advances a conditional current pointer and updates only the legacy denial projection. No authorization, reservation, claim, spend or activation writes. | PASS mocked SQL success/failure/rollback; no DB connection attempted. |
| Separate persistence review | Candidate 011 plus pinned inventory/coverage verifier, reconciliation and grant matrix. | OFFLINE REVIEW ONLY, not an installed migration or certification. |

Issuance is not publishing permission by itself: a current execution guard, scoped reservation, budget/policy switches, signed connector evidence, independent checkpoint and one-time claim are all still required. Unknown provider outcome, observation replay, terminal claim identity and cancellation safeguards are preserved. No provider-status reconciliation path was replaced or relaxed.

## Exact changed files

1. `src/server/authorization-issuance.ts`
2. `src/server/authorization-http.ts`
3. `src/app/api/publication-authorizations/route.ts`
4. `src/server/mysql-authorization-issuer-store.ts`
5. `src/server/connector-trust.ts`
6. `src/server/mysql-connector-evidence-store.ts`
7. `src/server/connector-evidence.ts`
8. `src/server/mysql-publication-authorization.ts`
9. `src/core/__tests__/authorization-trust.test.ts`
10. `src/core/__tests__/authorization-trust-proposal.test.ts`
11. `src/core/__tests__/helpers/content-sql-fixture.ts`
12. `src/core/__tests__/helpers/publication-bridge-fixture.ts`
13. `database/proposals/011_authorization_trust_candidate.sql`
14. `database/proposals/011_authorization_trust_manifest.json`
15. `scripts/verify-authorization-trust-proposal.cjs`
16. `docs/authorization-trust-persistence-reconciliation-20261019.md`
17. `docs/growthos-authorization-trust-evidence-20261019.md`

## Database reconciliation decisions

See the companion reconciliation document and JSON manifest for all exact table/index/FK/trigger names and tuple definitions, collation/width review, grant matrix, anchor/recovery protocol and integration sequence.

- 010 remains byte-identical in the certification reference: SHA-256 `bb10b32ec0186399ae10b1820541d4330aab500843cd0fcf2a82b4da515c2c5b`. Its 20 tables/11 triggers/40 FK columns/10 ledger entries are planned and live-BLOCKED in that source, not live-certified by this branch.
- New **review-only 011**, SHA-256 `7b9f5b15d2797c13bc6c30d04a08d49b5112a2545f264b543e86ffd5b303362a`, adds **8 tables, 29 explicitly declared indexes, 17 triggers and 52 FK columns** in 25 framed DDL statements. Every child FK has a declared covering index. With 001–010, planning inventory becomes **28 tables / 28 triggers / 92 FK columns / 11 ledger entries**, excluding later quota schema. No ledger entry was written.
- Parent identifiers/collations mirror 010 (InnoDB/DYNAMIC, utf8mb4_uca1400_ai_ci CHAR(36), utf8mb4_bin content/event keys, ascii_bin channels/hashes). Maximum declared index width modeled as 2336 bytes; real MariaDB 11.8/16KiB page/CHECK/index/privilege validation remains BLOCKED.
- Expanded-backup-v1 pins exactly **20/11/40/10** and is incompatible by contract with the new inventory. Preserve its refusal. A separate versioned recovery package must validate the new immutable/history/scope records and reconcile the separately retained anchor; no existing validator was amended or restore repeated.
- Quota-v2 has site-local weeks, UTC portfolio months and bigint charges/refunds but no installed durable adapter. Existing generation completion is not a publishing funding receipt, per-channel quota or permission to incur another charge. Missing execution guard refuses issuance/claim; no quota counters or spend are changed here.
- The old 010 prepared application harness expects the earlier claim contracts. It must be independently versioned with authenticated issuance, signed ingestion, anchor and execution fixtures before use against this application. No certification-branch test was edited to pretend compatibility.

## Commands, runtime and actual results

Working directory: `/workspace/scratch/886c85eece52/growthos-authorization-trust`. Actual runtime **Node v24.19.0, ICU 78.3, tzdata 2026b**. Dependencies reused with `ln -s ../growthos-release/node_modules node_modules` (exit 0); no clean install or Node 22 parity is claimed. Unit/typecheck/build/security commands ran sequentially.

| Command | Exit | Actual outcome |
| --- | ---: | --- |
| `git fetch origin feat/growthos-approval-connector-bridge-20261019 certification/growthos-mariadb-20261019 certification/growthos-expanded-backup-20261019 feat/growthos-quota-settlement-20261019` | 0 | Four heads matched requested SHA values via FETCH_HEAD inspection/assertions. |
| `git worktree add -b feat/growthos-authorization-trust-20261019 /workspace/scratch/886c85eece52/growthos-authorization-trust 88e11d23d26d61759d551bfeab5ab7920b6649de` | 0 | Isolated primary-source branch. |
| `git merge-base <primary/mariadb/quota-SHA> 3e7d7622cb672beb6025a146cae2396baa3cc063` | 0 each | Primary/quota -> integration ancestor; MariaDB -> pinned MariaDB head. |
| `git show e5b2c9678bb57817ba6a18e0f85df681f8c4e8e6:database/proposals/010_content_persistence_candidate.sql` | 0 | Read-only SQL/hash review, no installation. Piped SHA-256 check matched above. |
| `node --import=tsx --test src/core/__tests__/authorization-trust.test.ts src/core/__tests__/approval-connector-bridge.test.ts` | 0 | Intermediate 91 cases passed before final input/time/index regressions. |
| `node --import=tsx --test src/core/__tests__/authorization-trust.test.ts src/core/__tests__/authorization-trust-proposal.test.ts` | 0 | Intermediate 39 cases passed; subsequent final full suite includes added regressions. |
| `node --import=tsx --test --test-name-pattern='snapshots signed input' src/core/__tests__/authorization-trust.test.ts` | 1, then 0 | Reproduced mutable input/sequence defect, then passed after snapshot fix. |
| `npm test` | 0 | Final **349 tests: 348 passed, 1 existing skip, 0 failures**. Includes 42 added cases (39 issuance/trust plus 3 proposal cases). |
| `npm run typecheck` | 0 | Final TypeScript check. |
| `NEXT_TELEMETRY_DISABLED=1 npm run build` | 0 | Local Next.js production compilation/prerender with final application code. Subsequent changes were DDL/index manifest/offline-verifier/test/documentation only; affected verifier/tests and full unit/typecheck reran. No deployment. |
| `npm run test:security:offline` | 0 | Offline source security checks. |
| `npm run test:mutation-security:offline` | 0 | 52 existing mocked mutation/Origin/body assertions. |
| `npm run test:auth-cookies:offline` | 0 | Five mocked secure login/logout/request cases. |
| `node scripts/test-feature-route-mocked.cjs` | 0 | Ten feature-disable/security cases. |
| `node scripts/test-governance-route-mocked.cjs` | 0 | Eight grouped tenant/cursor/cost/unknown-health checks. |
| `node scripts/test-growth-engine-db-boundary-mocked.cjs` | 0 | Non-UTC reservation refusal and modeled rollback. |
| `npm run test:db-guards:offline` | 0 | Eight offline refusals; no connection authorized. |
| `node scripts/verify-production-migration-package.cjs` | 0 | Original nine hashes/ledger package passes offline; installationAuthorized/runtimeCertified false. |
| `node --check scripts/verify-authorization-trust-proposal.cjs` | 0 | New verifier syntax. |
| `node scripts/verify-authorization-trust-proposal.cjs` | 0 | Final candidate hash/inventory/FK-index coverage passes; installationAuthorized/runtimeCertified false. |
| `git diff --cached --check` | 0 | No whitespace errors. |
| `git diff --exit-code 88e11d23d26d61759d551bfeab5ab7920b6649de -- database/mysql scripts/mariadb-migration-runner.cjs scripts/disposable-backup-restore-rehearsal-candidate.cjs scripts/disposable-dump-guard.cjs scripts/production-migration-executor-candidate.cjs .github/workflows src/server/request-security.ts src/server/mysql-session.ts src/server/mysql-publication-claim-store.ts src/server/publication-evidence.ts` | 0 | Empty diff: certified migration/safety files, CSRF/session helpers, one-time claim store and signed provider verifier preserved. New candidate exists only outside the certified installer directory. |

During implementation, typecheck exited 2 for a widened string literal and a narrowed-null SQL test snapshot; both were corrected. A controlled regression exited 1 and demonstrated sequence advancing to 99 after a caller mutated a queued probe. The fix snapshots probe/destination before signature checking or awaiting, snapshots checkpoint challenges and server context, and rechecks the fresh execution-boundary timestamp. Final tests include both input and timing regressions. Earlier full runs (346/347/348 tests as cases were added) are not substituted for the final 349-case result. No currently executed check is failing.

## Limits, blockers and safest next sequence

The anchor, concurrency, HTTP and SQL tests are **simulations**. They do not certify actual cross-process leases, fsync/durability, MariaDB DDL/locking/grants, session authentication over a real application, real provider attestations or recovery against a running server. The no-op checkpoints/limits in historical fixtures are explicitly synthetic; default production paths deny. No infrastructure discovery or previously certified restore run was repeated.

1. Review the additive schema/manifest and service/principal split independently. Resolve migration numbering and source-010/old-harness compatibility; do not merge or install automatically.
2. Provide and certify an independent durable monotonic anchor, secure issuer/key provisioning and revocation audit/recovery ownership. Anchor rollback resistance is an infrastructure requirement; do not implement it as another table in the same SQL backup or a silently reset local file.
3. Integrate/certify durable quota-v2 and publication funding/ceiling controls. Implement a real current `PublicationExecutionGuard` rather than an always-allow callback. Authorization never creates money/quota or overrides global/feature shutdown.
4. Only in verified disposable MariaDB, separately review/apply 010 then 011; test all exact metadata/FKs/indexes/guards/grants, two-session issuance/consumption/revocation, deadlocks, disconnects and partial-DDL refusal. No SQL command was executed here.
5. Create a separately versioned expanded backup/restore contract for the new inventory and external-anchor reconciliation. Preserve existing archive hash pins, empty-destination guards, native-dump refusal, audit immutability and partial-install retry refusal.
6. Provision separate issuer/probe/consumer principals and trusted per-destination registry. Acquire the independent key lease before SQL locks and hold it through the complete transaction; never reuse an escaped checkpoint or acquire the lease while already holding SQL locks. Route wiring/preview UI, rate controls and key rotation/provisioning need independent integration review. Current API remains 503/unconfigured.
7. Execute Node 22 parity and verifiably isolated authenticated staging before any independent release approval. No claim that MariaDB or staging has passed.

No production database/Hostinger/customer data/real credentials, paid resource, GitHub Actions, PR, merge, deployment, scheduled worker, publishing or external provider call occurred. Source workflow push filters remain main/phase only; this new branch does not trigger them. **Production HOLD / NO-GO remains mandatory.**
