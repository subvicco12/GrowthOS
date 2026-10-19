# GrowthOS quota and settlement evidence — 2026-10-19

**Production HOLD / NO-GO.** New deterministic domain contracts and a separately reviewable persistence proposal are implemented. Durable runtime integration and database certification are BLOCKED. No provider, publisher or automation was activated.

## Source and commits

Source fetch verified `integration/growthos-product-engines-20261018` at exactly `ae1ccce603f7080c44e0c2025b00ce62105e8888`. Created the isolated branch `feat/growthos-quota-settlement-20261019` from that commit. Neither database certification branch was edited.

Verified code commit: `058dfbe09b778f0279d6e0e1b9c9c8439aabff45`. Its tree is `49a0a30076fcd49c86bb3e24ccd76001dc608a40`, identical to the locally tested code commit `d35d5213918d6779871a9043de08883b9a632220`. Git Data transport recreated commit metadata with the same parent and tree. The subsequent evidence-only commit contains this report; obtain its exact SHA with `git rev-parse HEAD` on the new branch.

Reviewed reservation evaluation/ledger, MySQL reservation and reconciliation, versioned content lifecycle, publication handoff/claims, signed provider evidence, connector projection and the integration/persistence proposal documents. The blueprint attachment was unavailable in this turn; no independent re-reading or full blueprint compliance certification is claimed. Repository section 49 decisions remain the basis of the proposal.

## Changes and outcomes

| Requirement | Actual outcome |
| --- | --- |
| Site-local weeks | PASS synthetic: explicit IANA zone, local Monday, UTC start/end, runtime rules-version snapshot, 167/169-hour DST weeks, fractional offsets, skipped-midnight refusal and unchanged UTC portfolio-month key. Unknown/missing zones and invalid timestamps fail closed. |
| Weekly capacity / consumption | PASS synthetic: reserve capacity atomically, mark chargeable start once, reject expired/new-period dispatch; cancel/expire before start releases held capacity. Started jobs retain units after failure or refund. No rollover of unused units. |
| Integer money / budget | PASS synthetic: bigint minor units, unsigned-BIGINT individual bounds, exact values above Number precision, site and portfolio caps across content types/sites. Explicit currency required; currency and overlapping timezone changes refused. |
| Settlement | PASS synthetic: unique event IDs, CAS versions and unique verified evidence IDs; exact replay is nonmutating; conflicting replay, over-refund and inconsistent final gross refuse. Verified overrun records actual charge and pauses; final settlement releases unused estimate, not consumed units. Unknown execution keeps its hold. |
| Authorization / isolation | PASS domain negative cases: foreign org/site/content scope, missing policy, disabled controls, reduced limits, stale/future/expired bounded authorization grants and revoked-role adapter results refuse. Every replay reauthorizes. Real session/role/approval verification remains an adapter obligation, not independently certified here. |
| Publication / lifecycle | Preserved: no changes to approval/claim/content status adapters, trusted publication evidence or duplicate-publication safeguards. New accounting does not authorize a publication or treat internal UI approval as permission. |
| Cost reporting | Preserved: recorded reservation costs are not relabeled as provider-invoiced spend. New settlement data is not exposed as a fabricated live metric. |
| Persistence | PROPOSED ONLY: three additive v2 tables, org-first transaction locking, scoped FKs, immutable journals, unique provider identity, original-month attribution, least privilege and crash/deadlock recovery obligations. No DDL or migration number allocated; no schema installed. |

Changed code: `src/core/quota-periods.ts`, `src/core/quota-settlement.ts`, `src/core/__tests__/quota-settlement.test.ts`. Proposal: `docs/quota-settlement-persistence-proposal-20261019.md`. This report is the fifth changed file.

The new contracts are intentionally unwired. The existing runtime still refuses non-UTC sites and cannot claim this new accounting until a durable adapter and independently reviewed schema exist. Passing synthetic serialization does not certify SQL locks, durability or triggers.

## Commands actually executed

Working directory: `/workspace/scratch/886c85eece52/growthos-quota-settlement`. Runtime Node `v24.19.0`, IANA rules `2026b`; dependencies reused by `ln -s ../growthos-release/node_modules node_modules` (exit 0). No npm installation or Node 22 parity is claimed. Final full checks ran sequentially, avoiding Next.js type generation races.

| Command | Exit | Actual result |
| --- | ---: | --- |
| `git fetch origin integration/growthos-product-engines-20261018 && git rev-parse FETCH_HEAD && git worktree add -b feat/growthos-quota-settlement-20261019 /workspace/scratch/886c85eece52/growthos-quota-settlement FETCH_HEAD` | 0 | Exact source SHA verified; new worktree/branch created. |
| `node --import=tsx --test src/core/__tests__/quota-settlement.test.ts` | 0 | Focused runs: 12, then 16, then 18 cases passed as checks were added. Final full suite includes all 22 new cases. |
| `npm test` | 0 | Final: 274 tests, 273 passed, one existing skip, zero failures. Includes 22 new quota/settlement cases. |
| `npm run typecheck` | 0 | Final no-emit TypeScript check. |
| `npm run build` | 0 | Final Next.js production compilation/prerender completed locally. No deployment. |
| `npm run test:security:offline` | 0 | Source security checks; no database/network. |
| `npm run test:mutation-security:offline` | 0 | 52 mocked mutation-security assertions. |
| `npm run test:auth-cookies:offline` | 0 | Five mocked login/logout cookie and request-security cases. |
| `node scripts/test-feature-route-mocked.cjs` | 0 | Ten mocked feature-disable/security cases. |
| `node scripts/test-growth-engine-db-boundary-mocked.cjs` | 0 | Existing non-UTC reservation guard refuses before policy/insert; rollback modeled. |
| `npm run test:db-guards:offline` | 0 | Eight negative guards; no DB connection authorized. |
| `git diff --cached --check` | 0 | No whitespace errors. |
| `git diff --exit-code ae1ccce603f7080c44e0c2025b00ce62105e8888 -- database scripts src/server .github/workflows` | 0 | Empty diff: all existing database files, safeguard scripts, runtime adapters and workflows unchanged. |

A preliminary `npm run typecheck` failed with exit 2: the newly required request currency was missing from synthetic fixtures. Fixtures were corrected to explicitly request USD; final typecheck/full checks passed. A first full suite (268 tests: 267 pass, one skip) and build passed before the final bounded-authorization and extra regression additions; all listed final checks were rerun after those changes. No currently executed check is failing.

## Test limits and remaining release gates

The synthetic store serializes org transactions, clones state and commits only on success. Tests exercise 20 competing reservations for one slot, two websites competing for one portfolio budget, competing CAS events, duplicate/reforged charge/refund evidence, failure/settlement/replay, full-refund quota retention, overrun pause, stale grants and unavailable policy. Its test verifier returns synthetic decisions; it neither verifies a real provider nor replaces cryptographic verification. Role denial is modeled at the authorization boundary, not authenticated HTTP staging.

BLOCKED:

1. Separately review/approve migration numbering and additive DDL, scoped indexes/FKs, charset/collation, immutable journals/terminal guards, original-month attribution and least-privilege grants. Do not change certified migrations or install a candidate without the authorized disposable certification path.
2. Implement/certify durable `AccountingStore`, fresh session/role/approval/connector authorization, signed issuer/account-scoped charge/refund/final-settlement evidence and append-only actor/audit records. No default trusting production verifier exists.
3. Real MariaDB 11.8 two-session contention, deadlock/rollback, unique-provider-event, crash recovery and least-privilege certification. No database command was run; no isolation or credentials were assumed. Previously established staging limitations were not rediscovered, and no backup/restore tests were repeated.
4. Node 22 and pinned ICU/tzdata parity. These executed results use Node 24 only.
5. Authenticated synthetic staging, current approval/version bridge, provider reconciliation incident handling, full blueprint review and all other independent release gates. No paid resource or live external call is justified by this work.

No production/Hostinger/customer data/real credentials, GitHub Actions, PRs, merges, deployments, publishing or automation activation occurred. HOLD / NO-GO remains in force.
