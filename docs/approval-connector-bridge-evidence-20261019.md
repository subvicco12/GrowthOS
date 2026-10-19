# GrowthOS approval/connector bridge evidence — 2026-10-19

**Production HOLD / NO-GO.** Offline implementation/regressions PASS. MariaDB, Node 22, authenticated staging, issuance/probe writers and production trust provisioning remain BLOCKED. No provider, publisher, scheduling worker or automation was activated.

## Verified source, specification and commits

Source branch `integration/growthos-product-engines-20261018` fetched at exactly `ae1ccce603f7080c44e0c2025b00ce62105e8888`. New isolated branch: `feat/growthos-approval-connector-bridge-20261019`. Work A `9bb1a1c5de3b70b7c9279e22dbbbc1efc57d9ea5` and Work B `41615f07510aa04952472571fd8030c2790c82b3` remain ancestors. Neither source, main, quota settlement nor database certification branches was changed.

Verified implementation commit: `7fb82b5988f55f3112c015e63fc8fcdf5b79d1ca`. Tree `5170590bed6c27e803bc905b735e17125d2bf06b` is identical to locally tested commit `978ac23a6b966691574077a456aca909878937f1`. Git Data transport recreated the commit metadata with the same source parent and verified tree. The evidence-only child contains this report; its exact final SHA is available using `git rev-parse HEAD` on the isolated branch.

Read the three requested repository evidence/proposal documents and the uploaded `Growth_OS_Complete_Master_Blueprint_Architecture_Bible(1) (1).docx` (SHA-256 `1a04e0a2afae7545740948aeaadb876c0f972f5ae7720128ec2b662354ce8a92`). Relevant requirements include sections 22–25/28 tenant and destination isolation, section 32 permissions/audit, sections 38–43 runtime security and publishing gates, and 49–51 quota/capability/verification boundaries. This branch does not claim completion of the full blueprint.

Reviewed actual internal decision route/service, session and organization membership handling, lifecycle/ContentStore, publication preparation/claim/reconciliation, provider signatures, website/content policies, reservations and shared connector projection. Internal recommendation decisions remain internal; they are not silently converted into publishing consent.

## Requirement-to-code and actual result

| Requirement | Implementation | Result / limit |
| --- | --- | --- |
| Version-bound approval | `core/publication-authorization.ts`: strict v1 schema binds org/site/content/version, full canonical record SHA-256, channel, destination ID/revision/target, reservation ID, approval event ID, approver/time, issuance/expiry and policy hash. | PASS synthetic. Purpose must be `content_publication`, decision approved; an internal decision is refused. |
| Durable approval evidence | `server/mysql-publication-authorization.ts` reads the scoped immutable `approve` content event, actor, occurrence time and preceding approved snapshot; reconstructs the scheduled record fingerprint. | PASS mocked SQL. A JSON approval flag alone cannot substitute for the content event. Actual journal immutability remains a database gate. |
| Current authorization | Locked session/user, current requester AND approver memberships/users. Both roles explicitly owner/admin; editor/viewer/unknown deny. | PASS synthetic negatives for revoked/expired/unknown session, disabled user, removed membership and roles. No authenticated HTTP staging ran. Memberships remain organization-wide, not a new website ACL system. |
| Current policy/destination | Existing org pause, active/verified site, automation, auto-publish, content policy and scoped completed reservation gates retained. New feature flag, policy revision, destination revision/target/enabled and exact actual-cost integer checked. | PASS synthetic: stale/missing/foreign approvals, content versions, policy/destination changes, unavailable budget and invalid/cancelled reservation deny. |
| Verified connector health | `server/connector-evidence.ts`: HMAC-SHA256 with explicitly injected >=32-byte issuer key, issuer/key/trust revision, org/site/channel/destination/revision/target, capability and bounded checked/expiry. Current issuer revocation and attestation revocation read under lock. Default trust list empty. | PASS synthetic signatures and negatives. Unknown/disconnected/unavailable/read-only, forged/future/expired/revoked/foreign evidence deny. Legacy unsigned health is only an additional deny gate, never sufficient authority. |
| Freshness at consumption | Approval validity <=24 hours; connector validity <=5 minutes. Receipt expires at minimum session/approval/connector deadline; backward/nonfinite clock or crossed deadline denies consumption. | PASS synthetic deadline crossing after claim insertion rolls the entire transaction back. |
| One-time claim/audit | `server/mysql-publication-claim-store.ts`: authorization verification, claim insert, consumed CAS, use audit, content event and `publication_unknown` CAS use the same connection/transaction. Requester actor is retained in the content event. | PASS synthetic: 20 simultaneous claims yield exactly one claim/use/content event; persistence failures leave authorization unconsumed and recover with the same identity. Not a real concurrency certification. |
| Preparation | `core/publication-handoff.ts` requires private server authorization context/version in addition to preliminary boolean deny gates. Store must reauthorize. Context/session digest is stripped from the prepared result. | PASS synthetic. Prepared is a local intent, not remote publication or provider success. |
| Existing safeguards | Signed provider observation verifier, replay journal and reconciliation body preserved. Existing claim identity stays one-time even after verified absence; unknown content cannot be cancelled/retried. | PASS existing integration regressions. No certified schema or safety package was modified. |
| Persistence | `docs/approval-connector-persistence-proposal-20261019.md` describes additive scoped records, unique uses, immutable guards, role separation, revision/ingestion/issuance obligations and recovery. | PROPOSED / NOT INSTALLED. No candidate DDL executed. Missing tables/rows or empty trust deny; no fallback. |

## Changed files

- `src/core/publication-authorization.ts`
- `src/core/publication-handoff.ts`
- `src/server/connector-evidence.ts`
- `src/server/mysql-publication-authorization.ts`
- `src/server/mysql-publication-claim-store.ts`
- `src/core/__tests__/approval-connector-bridge.test.ts`
- `src/core/__tests__/helpers/publication-bridge-fixture.ts`
- `src/core/__tests__/helpers/content-sql-fixture.ts`
- `src/core/__tests__/content-lifecycle.test.ts`
- `src/core/__tests__/mysql-content-persistence.test.ts`
- `src/core/__tests__/product-engine-integration.test.ts`
- `docs/approval-connector-persistence-proposal-20261019.md`
- `docs/approval-connector-bridge-evidence-20261019.md`

## Executed commands and results

Working directory `/workspace/scratch/886c85eece52/growthos-approval-bridge`. Actual Node **v24.19.0**, ICU **78.3**, tzdata **2026b**. Existing dependencies reused via `ln -s ../growthos-release/node_modules node_modules` (exit 0). No Node 22 execution or clean dependency installation is claimed. Final suite/typecheck/build/security checks were sequential; no `.next/types` race was introduced.

| Exact command | Exit | Actual result |
| --- | ---: | --- |
| `git fetch origin integration/growthos-product-engines-20261018 && test "$(git rev-parse FETCH_HEAD)" = ae1ccce603f7080c44e0c2025b00ce62105e8888 && git worktree add -b feat/growthos-approval-connector-bridge-20261019 /workspace/scratch/886c85eece52/growthos-approval-bridge FETCH_HEAD` | 0 | Exact source verified; isolated branch created. |
| `git merge-base --is-ancestor 9bb1a1c5de3b70b7c9279e22dbbbc1efc57d9ea5 HEAD && git merge-base --is-ancestor 41615f07510aa04952472571fd8030c2790c82b3 HEAD` | 0 | Both histories preserved. |
| `node --import=tsx --test src/core/__tests__/content-lifecycle.test.ts src/core/__tests__/mysql-content-persistence.test.ts src/core/__tests__/product-engine-integration.test.ts` | 0 | 25 affected cases passed. |
| `node --import=tsx --test src/core/__tests__/approval-connector-bridge.test.ts` | 0 | Final focused run: 55 tests passed. Earlier focused runs passed while assertions were added. |
| `node --import=tsx --test src/core/__tests__/approval-connector-bridge.test.ts src/core/__tests__/content-lifecycle.test.ts src/core/__tests__/mysql-content-persistence.test.ts src/core/__tests__/product-engine-integration.test.ts` | 0 | Intermediate 75-case run passed before five final negative/deadline cases; final full suite includes them. |
| `npm test` | 0 | Final 307 tests: **306 passed, 1 existing skip, 0 failed**. Includes all 55 new bridge cases. |
| `npm run typecheck` | 0 | Final TypeScript no-emit check. |
| `NEXT_TELEMETRY_DISABLED=1 npm run build` | 0 | Final local Next.js production compilation/prerender. No deployment. |
| `npm run test:security:offline` | 0 | Offline source security checks. |
| `npm run test:mutation-security:offline` | 0 | 52 mocked mutation/Origin/body/security assertions. |
| `npm run test:auth-cookies:offline` | 0 | Five mocked secure login/logout/request-security cases. |
| `node scripts/test-feature-route-mocked.cjs` | 0 | Ten mocked feature-disable/security cases. |
| `node scripts/test-governance-route-mocked.cjs` | 0 | Eight grouped governance/tenant/cursor/cost/unknown-health checks. |
| `node scripts/test-growth-engine-db-boundary-mocked.cjs` | 0 | Existing non-UTC reservation refusal/rollback before insert. |
| `npm run test:db-guards:offline` | 0 | Eight offline refusals, no DB connection authorized. |
| `node scripts/verify-production-migration-package.cjs` | 0 | `OFFLINE_CONTRACT_PASS`; installationAuthorized/runtimeCertified false. Nine original hashes and ledger package verified. |
| `git diff --cached --check` | 0 | No whitespace errors. |
| `git diff --exit-code ae1ccce603f7080c44e0c2025b00ce62105e8888 -- database scripts .github/workflows src/server/publication-evidence.ts src/core/content-lifecycle.ts src/server/mysql-content-store.ts` | 0 | Empty diff: baseline database files, certification scripts, workflows, provider verifier, lifecycle and content persistence preserved. |

FAIL: no executed test/check remains failing; no test run failed during this implementation. A batched Git transport content read exceeded output size and was retried per-file; the resulting remote implementation tree was checked against the tested local tree. This was not a test result.

Baseline migration ledger file SHA-256 is `4a20c75d96d31f23aba12256175ba927fbd2476321b8e49f3d393c5f188419ee`. The source package has nine migration entries; this branch does not import or certify the separate candidate migration 010. **No database file was edited**, including any certified migration. No backup/restore test was repeated. Existing workflows only push on main/phase branches (or PR/manual triggers); no workflow was dispatched and this development branch is outside push filters.

## Limits and remaining gates

The SQL fixture is a serialized clone/rollback simulator. Signatures use a fixed synthetic in-memory key; no real credential, issuer registry, provider, HTTP staging, MariaDB SQL parser/lock manager, grants or crash durability was exercised. Mocked SQL evidence cannot certify MariaDB behavior.

BLOCKED before adoption/activation:

1. Separately approve additive schema, migration numbering/dependencies (including alignment with independently certified 010), indexes, charset/collation, immutable approval/use/revocation/claim guards and least-privilege installer/issuance/probe/consumer grants. Do not weaken existing migration or backup/restore inventory validators to accept these records.
2. Implement the authenticated explicit authorization issuance/revocation workflow. The existing first-party internal approval remains internal and no automatic publisher bridge is enabled. Only the server may derive session digest and scope from secure cookies; never accept browser-provided actor/role/digest as authority.
3. Implement trusted probe ingestion with immutable signed-event history and anti-rebinding/rollback protection, current monotonic policy/destination/trust revisions, secure key provisioning/rotation/revocation and retained audit evidence. The default registry is empty. Connector configuration alone never establishes healthy status.
4. Run real disposable MariaDB 11.8 two-session claim/revocation/disable races, approval reuse/unique constraints, deadlocks, crash/rollback recovery, FK, trigger and least-privilege tests; then separately certify expanded backup/restore compatibility. No database command was run because isolation was not established here.
5. Node 22 parity and fully isolated authenticated staging E2E. No environment discovery or previously certified restore work was repeated merely for reporting.
6. Connect reviewed quota/settlement and per-channel publication-cost gates. A completed generation reservation is not permission to incur another charge or a complete publication quota contract.
7. The future real provider-status probe must resolve the immutable authorization/destination for the claim and attest the correct external account; the preserved observation envelope binds claim identity but has no explicit destination field. No real outbound/provider attestation or automated recovery for contradictory observations is certified.

No production/Hostinger/customer data/real credentials, paid resources, GitHub Actions, PRs, merges, deployments, external provider calls, publishing or automation activation occurred. **HOLD / NO-GO remains in force.**
