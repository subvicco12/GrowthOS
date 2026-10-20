# Content Factory and Safe Publication evidence — 2026-10-20

**Production HOLD / NO-GO. Application logic verified offline with synthetic fixtures; production persistence/provider integration BLOCKED.**

Implementation commit: `7732f240cd73b4dd4d5677850e5068a2fca25fc9`, tested tree `26d20d454ace1a833b9396f4fad95331f600f2c0`. This evidence is a subsequent documentation commit on `feat/growthos-content-provider-completion-20261020`; final branch HEAD is reported at delivery. Parent is exactly the requested source `8b0e2d9eb52eb184eb9ecc5ba5b2521eb0acf71d`.

## Verification and boundaries

`git fetch origin feat/growthos-authorization-trust-20261019` and `git ls-remote origin refs/heads/feat/growthos-authorization-trust-20261019` exited 0; remote HEAD matched the expected SHA. `git worktree add ../growthos-content-provider -b feat/growthos-content-provider-completion-20261020 8b0e2d9eb52eb184eb9ecc5ba5b2521eb0acf71d` exited 0. `ln -s ../growthos-release/node_modules ../growthos-content-provider/node_modules` exited 0. Dependencies were reused, not installed or upgraded.

Read the uploaded Master Blueprint (SHA-256 `1a04e0a2afae7545740948aeaadb876c0f972f5ae7720128ec2b662354ce8a92`) and existing lifecycle, handoff, approval/authorization, connector trust, SQL content/claim stores, signed provider evidence, generic job runner and associated tests. No initial product audit or previous database restore certification was repeated.

Only new source/test/docs files are added. No migrations/proposals 001–012, certified hashes, trust-anchor design, quota settlement, production configuration, staging files or existing source branches are modified. No database/provider/network/worker implementation is enabled.

## Requirement-to-code matrix

| Requirement | Implemented code and verification | Status |
| --- | --- | --- |
| Research and brief orchestration | content-factory.ts: verified source receipt/snapshot/freshness, required brief, disclosure/asset inventory | PASS synthetic transaction tests; actual provenance verifier BLOCKED |
| Draft and revisions | content-factory.ts: bounded text, CAS/events, revision resets quality/consent/schedule; linked unclaimed invalidation mandatory | PASS synthetic; durable adapter BLOCKED |
| Originality | content-originality.ts: bounded normalized supplied-corpus comparison; verified report required separately | PASS advisory tests; never proof of global originality |
| Rights, factual claims, disclosure, regulated review | Exact source coverage and claim digest; per-asset license/attribution, server policy disclosures, bound qualified review and trusted issuer callback | PASS synthetic negative tests; real verifier registry/proof custody BLOCKED |
| Human approval | Explicit owner/admin consent to review hash/QA ID; original approver rechecked on scheduling | PASS offline; factory approval cannot replace separate publication authorization |
| Schedule and cancellation | Local scheduled record/job intent; before-claim cancellation/invalidation must share transaction; no timers | PASS contract tests; durable job store BLOCKED |
| WordPress/extensible channels | DisabledPublishingChannel and SyntheticWordPressProvider: escaped draft output, synthetic .invalid destination, signed destination-bound status | PASS fixture tests; real WordPress connectivity NOT TESTED |
| Atomic claims/funding | SafePublicationWorkflow requires one fenced transaction covering fresh independent authorization/connector checks/quota-v2 funded start/claim/content/audit/job CAS | PASS simulated rollback/concurrency; actual unified adapter BLOCKED |
| Reconciliation and retries | Signed fixture registry/revocation/destination scope; immutable replay contract; unknown retains claim; probe-only bounded retries/manual review | PASS simulated; no provider dispatch path |
| Tenant/session/policy denial | Fresh server context, role/scope checks, commit recheck, revoked session/connector and unavailable funding/fence refusals | PASS synthetic, not authenticated staging |

See `docs/content-provider-integration-contract-20261020.md` for exact callback obligations, serialization dependencies, atomic transaction boundaries and the safe integration sequence. `docs/content-provider-test-results-20261020.json` records command/exit evidence and log digests.

## Exact changed files

- `src/core/content-factory.ts`
- `src/core/content-originality.ts`
- `src/core/safe-publication-jobs.ts`
- `src/server/synthetic-wordpress-provider.ts`
- `src/core/__tests__/content-factory-orchestration.test.ts`
- `src/core/__tests__/content-originality.test.ts`
- `src/core/__tests__/safe-publication-workflow.test.ts`
- `docs/content-provider-integration-contract-20261020.md`
- `docs/content-provider-test-results-20261020.json`
- This evidence document.

## Executed tests, commands and exit codes

Working directory: `/workspace/scratch/886c85eece52/growthos-content-provider`. Actual runtime **Node v24.19.0**. These results do **not** certify Node22, live MariaDB, a real provider or authenticated staging. Unit/typecheck/build/security checks ran sequentially. No npm ci, external API, Actions or cloud build was run.

| Exact command | Exit | Actual result |
| --- | ---: | --- |
| `node --version` | 0 | v24.19.0 |
| `node --import=tsx --test src/core/__tests__/content-factory-orchestration.test.ts src/core/__tests__/content-originality.test.ts src/core/__tests__/safe-publication-workflow.test.ts` | 0 | 71 tests, 71 PASS, 0 FAIL/SKIP. |
| `npm test` | 0 | 420 tests: 419 PASS, 1 existing SKIP, 0 FAIL. Includes all 71 new tests. |
| `npm run typecheck` | 0 | PASS no-emit TypeScript. |
| `NEXT_TELEMETRY_DISABLED=1 npm run build` | 0 | PASS local Next.js production compilation; no deployment. |
| `npm run test:security:offline` | 0 | PASS offline source checks. |
| `npm run test:mutation-security:offline` | 0 | PASS 52 mocked mutation/Host/Origin/body assertions. |
| `npm run test:auth-cookies:offline` | 0 | PASS 5 mocked cookie cases. |
| `npm run test:db-guards:offline` | 0 | PASS 8 refusal cases; no connection authorized. |
| `node scripts/test-feature-route-mocked.cjs` | 0 | PASS 10 feature/security cases. |
| `node scripts/test-governance-route-mocked.cjs` | 0 | PASS 8 grouped route cases. |
| `node scripts/test-growth-engine-db-boundary-mocked.cjs` | 0 | PASS non-UTC refusal and modeled rollback; not quota-v2 persistence. |
| `node scripts/verify-production-migration-package.cjs` | 0 | PASS original nine migration/ledger package pins; no installation. |
| `node scripts/verify-authorization-trust-proposal.cjs` | 0 | PASS unchanged 011 hash/model; not SQL certification. |
| `npm run migration:plan` | 0 | PASS offline plan; no migration installed. |
| `git diff --check` | 0 | PASS whitespace. |
| `git diff --cached --check` | 0 | PASS staged whitespace. |
| `git diff --exit-code 8b0e2d9eb52eb184eb9ecc5ba5b2521eb0acf71d -- database scripts/mariadb-migration-runner.cjs scripts/disposable-dump-guard.cjs scripts/disposable-backup-restore-rehearsal-candidate.cjs scripts/production-migration-executor-candidate.cjs src/server/connector-trust.ts src/core/quota-settlement.ts src/core/quota-periods.ts src/server/mysql-publication-claim-store.ts src/server/mysql-publication-authorization.ts src/server/publication-evidence.ts .github/workflows staging` | 0 | Empty diff: protected database/safety/trust/quota/claim/security/staging/workflow files unchanged. |

Intermediate focused suites passed 26 factory cases and 34 job/provider cases, then expanded to 64/69/70; final **71** supersedes those counts. Earlier full suite was 419 tests/418 passed/one skip before the final factory-to-provider/default-denial integration test. Final 420-case unit/typecheck/build/security checks were rerun after that addition. No application source changed after the final verification sequence.

### Confirmed defects addressed while implementing

A controlled mutation test removed the command snapshot and ran:

`node --import=tsx --test --test-name-pattern=queued reconciliation snapshots src/core/__tests__/safe-publication-workflow.test.ts`

It exited **1**, reproducing a queued-request audit identity race: processing used the earlier evidence snapshot while the command hash could reflect caller-mutated evidence. The fix clones the entire parsed command before awaiting a transaction/lease; final focused/full suites include the passing regression. The temporary mutant was restored and was never committed.

Additional guards verified by final negative tests: whitespace-only revisions reject; rights cover every declared asset; source/quality expiry at commit refuses; linked-job invalidation failure rolls back revisions; old approvals cannot survive revised content; destination-origin status lies refuse; public job schemas reject stored session-bearing claims; version counters cannot exceed safe integers. No currently executed test is failing. The SQL/session/lease/funding stores in tests are explicitly serialized synthetic simulations, not proof of real transaction isolation or fencing.

## Integration blockers — production remains unavailable

1. **Durable factory adapter:** source SQL ContentStore cannot accept brief/revise/envelope writes by type casting. Review backward-compatible metadata serialization and append-only event support; preserve root record mirrors and full-record authorization hashes. No replacement tables or migration changes were invented.
2. **Verified source/QA authority:** real snapshot retrieval, source claim review, rights/license proof, originality corpus/reports, qualified regulated reviewers, issuer revocation/custody and policy-driven disclosure checks. Current fixture verifiers authenticate only supplied synthetic registries. Advisory matching uses canonical text hashes (`factoryHash(text)`), not raw-byte retrieval digests or a global plagiarism certificate.
3. **Atomic job/publication/funding adapter:** must hold the existing independent fenced lease before SQL locks and atomically combine current session/approval/connector checks, separate quota-v2 publication reservation/start, claim/content transition, authorization use, job CAS and audit. Existing claimOnce/reconcile commit internally; do not compose them in separate transactions. Missing adapter defaults throw.
4. **Real provider evidence:** synthetic WordPress has no live publish method. Any future real adapter requires destination-aware trusted status evidence, current revocation, replay persistence, approved scopes/credentials and separate external certification. Never route the generic auto-retry JobRunner into non-idempotent publishing.
5. **Actual certification:** Node22 parity, durable MariaDB concurrency/recovery/grants, independent fencing behavior and fully isolated authenticated staging remain BLOCKED/unexecuted. Previously unavailable infrastructure discovery and certified restore tests were not repeated.

Safe next sequence: persistence owners review metadata/job representation → implement authenticated provenance and atomic funded/fenced adapters behind unavailable defaults → certify real database concurrency/revocation/recovery and Node22 parity → test isolated authenticated staging → separately review any real provider integration. Scheduling remains local intent, publishing/automations disabled, and every live release gate still needs explicit approval.

No production/Hostinger/customer data/real credentials, paid resources, external provider calls, GitHub Actions, PRs, merges, deployments, publishing or worker/automation activation occurred. Existing workflow push filters target main/phase branches; the new feature branch does not match them. **Release readiness: NOT READY; production HOLD / NO-GO.**
