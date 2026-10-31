# Session 02 — Ownership and Durable Manual Workflows

Updated: 2026-10-31T20:56:08.473240+00:00

**Delivered working, tested isolated-development vertical slices. Production release: HOLD.** No production deployment, merge, push, GitHub Actions, paid service activation, production credentials, or live publishing/automation occurred.

## Session 1 preservation and review checkpoints

- Repository: `subvicco12/GrowthOS`; branch `feat/growthos-final-product-closure-20261024`.
- Inspected the working tree before editing. It contained the complete uncommitted Session 1 implementation/reports and no other application changes.
- Created local Git checkpoint **`3fbcd17638c88cc0a64c2d415742fb4b9a5f478a`**, preserving all 16 Session 1 implementation/report files (964 inserted lines). Available local Git change management was used; no workspace switch, reset, merge or remote branch operation was needed.
- Session 1 report contents are preserved in that checkpoint, including the previous LATEST_PROGRESS_REPORT.md. The Session 1 implementation report, test evidence and runtime report files remain unchanged.
- Session 2 implementation checkpoint: **`e29d3d6ac98a6b48d66f471b23c7c93e67ea9a9d`** (17 files, 971 insertions, 2 deletions). It contains the new application code, tests, independent schema proposal and its runbook. This report and updated latest progress/evidence are delivered as a subsequent report-only checkpoint.
- Continued with the existing Node **22.23.4** runtime and installed dependencies. No repeated environment certification or lockfile installation/update was performed.

## Implemented connected capabilities

### Ownership verification and connector onboarding

Added expiring ownership challenges scoped to the selected organization, website and authenticated actor. Challenges use 32 random bytes; the database stores only SHA-256 hashes. Issuing a challenge supersedes pending checks; proofs expire after 30 minutes, permit at most 3 attempts, and are limited to 5 challenges per website per rolling day. Proof checking reserves the challenge before network work and rechecks current membership, website domain/state and challenge expiry afterward.

The transport accepts only the registered host and the fixed `/.well-known/growthos-verification.txt` path over TLS/443. It requires an exact operator allowlist, rejects internal/IP/credential/port/path host input, rejects private/reserved IPv4 DNS results, pins a validated IPv4 address, validates TLS certificates and hostname, follows no redirects, refuses compressed content, and enforces an 8-second total deadline and 16 KiB UTF-8 response cap. IPv6-only hosts and proxy-only environments without an approved pinned proxy transport fail closed. The inherited proxy is not bypassed.

A matched proof records ownership only; it does not activate the website, connector, automation or publishing. Owners/admins can persist and revoke **connector drafts** after a WordPress site's proof is recorded. Endpoint derives from the registered domain; no arbitrary endpoint or credentials can be supplied. Live connector credentials and health remain explicitly unavailable.

**External ownership certification was not performed.** Security unit tests replace network I/O; MariaDB proof-success tests use controlled proof responses. Browser verification demonstrates the explicit unavailable state for an unconfigured test host. No external site was contacted or falsely claimed verified by this session's tests.

### Persistent technical, SEO and competitor intelligence

Added durable analysis records containing the supplied observations, source label, observation time, competitor claims, technical/SEO findings, feature candidates, prioritized recommendations and outcomes. The existing manual intelligence engine computes actual findings from the provided observations; no external research, competitor inventory, traffic, revenue, or provider success is fabricated. Every result remains `UNVERIFIED_MANUAL_INPUT`.

Derived recommendations are persisted independently, linked to the existing internal approval queue. Status tracking reflects that queue's pending/approved/rejected/deferred decisions. The UI supports internal review through the existing authenticated approval endpoint. Recommendation approval does not create execution authority or dispatch external work.

The website registry now embeds a real persisted workflow panel: submit observations, issue/check ownership proofs, prepare/revoke connector drafts, inspect findings and competitor claims, review recommendations, and reload durable records. Current website portfolio ownership state is synchronized after a confirmed load. Viewer access is read-only; editors can submit evidence but cannot operate jobs or ownership controls.

### Durable manual job lifecycle and administration

Implemented job creation with stable request keys and conflict detection, explicit internal approval before run, persisted due times/rescheduling, manual run of approved due jobs, cancellation, up to 3 attempts with bounded retries, failure codes and immutable execution events. Concurrent runs produce one completed result and a retryable conflict for the loser. Results, recommendation approval records and events commit atomically; a deliberately failing disposable trigger proved rollback of the whole attempt.

Jobs enforce fresh organization roles, tenant/site scope, pause/archive controls, 20 jobs per site per 24 hours, and a feature-shutdown watermark. Any later shutdown audit event invalidates earlier pending jobs; a new independently reviewed manual job is required to continue. A cancelled/completed job cannot be run again. Stored observation scope and input hash are checked at execution.

The analysis runner performs finite local computation only, with **zero external requests and zero external spend**. There is no paid provider, autonomous scheduler, background dispatcher, publisher, or external automation worker. Scheduling is durable but a due job still requires explicit administrator action. The UI labels this boundary and exposes status, due time, attempt count, failures, derived results, approvals and recent immutable events.

## Persistence proposal and isolation

Existing production-oriented intelligence adapters depend on review-only candidates 015–016. Those were not activated or repurposed.

Created separately reviewable proposal **017**, independent of 010–016 and dependent only on approved 001–009:

`database/proposals/session02-isolated-workflows/017_session02_disposable_candidate.sql`

SHA-256: `c0f60a081f197f67d4739a5a7debb7be88f31907b92b5955d98b946fe7492e58`.

It defines six `growth_dev_*` tables: a contract marker, ownership challenges, connector drafts, analysis jobs, derived recommendations, and workflow events. Four triggers enforce recommendation/event immutability. It is not registered with a production migration runner and has no automatic startup DDL.

The explicit disposable installer and runtime both require `GROWTHOS_SESSION02_DISPOSABLE=YES`, `GROWTHOS_TEST_DB_DISPOSABLE=YES`, a `growthos_test_*` database name, and loopback DB host. Without that opt-in, the new API returns **501 ISOLATED_SCHEMA_REQUIRED before opening a database connection**, and existing core website settings remain available.

**017 was installed only in the explicitly opted-in disposable MariaDB test database**, not approved for deployment. No approved migration files or candidate 010–016 contracts changed. The test ledger lists exactly 001–009; schema inventory confirms only the six independent new tables/four triggers were added. Existing database contracts and package-lock.json remain unchanged.

## Automated results — exact executed outcomes

| Check | Exit | Actual result |
| --- | --- | --- |
| `npm test` | **0** | **617 PASS / 0 FAIL / 3 SKIP**, 620 total. The three skipped cases require disposable DB opt-in and were separately executed successfully. Includes 12 new security/domain/HTTP cases. |
| `npm run typecheck` | **0** | PASS on final source. |
| `npm run test:security:offline` | **0** | PASS. |
| `npm run test:db-guards:offline` | **0** | PASS, 8 refusal checks. |
| `npm run test:auth-and-session:offline` | **0** | PASS, cookie/session regressions. |
| `npm run test:mutation-security:offline` | **0** | PASS, 52 mutation security assertions. |
| Registration and feature-shutdown mocked scripts | **0 each** | PASS, existing registration/shutdown regressions. |
| Approved disposable migration runner | **0** | 001–009 passed: 15 InnoDB tables, 4 baseline audit triggers, 23 FK columns and functional checks. |
| `node scripts/install-session02-disposable.cjs` | **0** | Independent proposal 017 installed only in test schema. |
| `node scripts/run-session02-integration.mjs` | **0** | **1 PASS / 0 FAIL / 0 SKIP**, extensive real-session/SQL ownership/job/approval/quota/rollback/history scenario. |
| Existing approval integration runner | **0** | **1 PASS / 0 FAIL / 0 SKIP** against disposable MariaDB. |
| Session 1 website-settings integration runner | **0** | **1 PASS / 0 FAIL / 0 SKIP** against disposable MariaDB. |
| `node scripts/test-session02-browser.cjs` with isolated configuration | **0** | **6 browser scenarios PASS**: proof unavailable state, approval-gated analysis/results, persistence after reload, cancellation, 390px layout, viewer controls. |
| Session 1 website-settings browser script | **0** | **5 browser scenarios PASS** against the same real local HTTPS app and disposable DB. |
| `npm run build` with telemetry disabled | **0** | PASS, optimized build and traces; `/api/isolated-workflows` included. |
| New installer/integration/browser runners without opt-in | **2 each** | Expected safe refusal before connecting, not an application failure. |
| `git diff --check` and unchanged migration/lockfile checks | **0** | PASS. |

The new npm alias `test:session02:mysql` wraps the executed integration runner; no unexecuted alias is separately counted as a pass. Real DB tests used **MariaDB 11.8.9-MariaDB-ubu2404** in `growthos_test_session02`, tmpfs-backed and published only to loopback. Browser tests used synthetic local accounts, real session cookies, a local HTTPS proxy and actual API persistence; external browser traffic was aborted.

Intermediate tests caught a TypeScript environment type issue and a MariaDB record-changed contention response that initially surfaced as generic 503. Both were fixed. Record-changed/deadlock/lock-timeout outcomes before COMMIT now return retryable 409; uncertain COMMIT/rollback outcomes remain a 503 operator hold, without blind automatic retry. Final tests above passed; interrupted invocations are not counted as successful verification.

Machine-readable evidence: `SESSION_02_TEST_RESULTS.json`. Detailed command logs remain under `/workspace/.growthos-runtime/logs/session02-*`. No unexecuted live integration, external network proof, migration chain, or production readiness check is claimed passed.

## Changed files

- `database/proposals/session02-isolated-workflows/017_session02_disposable_candidate.sql`
- `database/proposals/session02-isolated-workflows/README.md`
- `package.json`
- `scripts/install-session02-disposable.cjs`
- `scripts/run-session02-integration.mjs`
- `scripts/test-session02-browser.cjs`
- `src/app/api/isolated-workflows/route.ts`
- `src/app/globals.css`
- `src/app/isolated-workflow-panel.tsx`
- `src/app/organization-website-registry.tsx`
- `src/core/__tests__/isolated-workflows.integration.test.ts`
- `src/core/__tests__/isolated-workflows.test.ts`
- `src/core/isolated-workflows.ts`
- `src/server/bounded-ownership-fetch.ts`
- `src/server/isolated-workflow-runtime.ts`
- `src/server/isolated-workflows-http.ts`
- `src/server/mysql-isolated-workflows.ts`

Also updated/created the required `reports/codex-cloud/LATEST_PROGRESS_REPORT.md`, `SESSION_02_IMPLEMENTATION.md`, and machine-readable `SESSION_02_TEST_RESULTS.json`. Next.js-generated next-env.d.ts was restored to exact checkpoint content after build.

## Security and incomplete functionality

- Tenant identity comes from verified session/membership, never body claims. All persistence is scoped to organization and website, with membership rechecked under transaction locks; ownership completion rechecks authority after transport.
- Mutations enforce canonical HTTPS Origin/Host, strict bounded JSON and roles; schema/SQL errors are redacted. No private connector credential is collected or stored by the draft flow.
- Audit/recommendation immutability and rollback were exercised in real MariaDB. Proposal production grants, populated upgrades, backup/restore and retention remain uncertified.
- Ownership verification is implemented but not certified against live public websites. Proxy-aware pinned egress, IPv6 support, ownership expiry/revocation after successful proofs, trusted connector enrollment, key custody and real health checks remain incomplete.
- All supplied research remains unverified; no crawler, live SEO provider, external competitor research, analytics or monetization connector was activated.
- Jobs are durable local manual analyses, not general production automation. Background scheduling, external execution authority, paid budget reservations, in-flight cancellation across workers and recovery leases remain incomplete. Recent UI windows are bounded to 25 jobs, 100 recommendations and 50 events; full pagination and fleet-wide monitoring remain future work.
- General metadata/lifecycle audit coverage from Session 1 is still incomplete. This session adds ownership/workflow event history, not a claim that every existing product action is audited.
- The new schema remains a review proposal, unavailable outside explicit disposable development. **010–016 were not executed.** Broader production integration and independent certification are still mandatory.

## Next substantial priorities

1. Independently review proposal 017 and reconcile it with the existing 010–016 candidates without changing their contracts or activating them by default.
2. Add an approved proxy-aware public ownership transport, post-verification revocation policy, trusted connector enrollment and authenticated read-only health verification.
3. Complete immutable source provenance/revocation, paginated research/recommendation/job history and full multi-organization operational monitoring.
4. Design and independently certify a leased/background worker with approval revocation, stop-fence checks, crash recovery, spend reservations and safe external adapters before any execution activation.
5. Run separately authorized populated-schema/grants/backup-restore and multi-tenant staging certification. None of these gates is waived by local test passes.

Session-owned HTTPS services were stopped, the disposable container was removed (exit 0), and local DB credentials/TLS private material were deleted after testing. **Production release remains HOLD.** Session 1 and the substantial Session 2 work are preserved in local reviewable checkpoints; no production or remote branch was changed.
