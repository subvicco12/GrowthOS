# GrowthOS final product closure — development register (24 October 2026)

Status: **DEVELOPMENT IN PROGRESS / PRODUCTION HOLD**. Live MariaDB 11.8 certification is explicitly deferred by user instruction, not passed or waived.

## Verified source baseline
- Work branch: `feat/growthos-final-product-closure-20261024`, forked from `feat/growthos-final-authority-completion-20261021`.
- The authority branch is one commit ahead of `integration/growthos-final-publication-20261021` with changes limited to the revision binder, its mocked tests and evidence.
- Previous authority-branch report records Node 24 offline suite 469 PASS / 1 SKIP, typecheck PASS and capped build PASS. These results have **not** been rerun on this branch.
- The repository's `package.json` uses Next 15.5.24 and provides `npm test`, `npm run typecheck`, `npm run build` and security/DB-guard offline suites.

## Product completion workstream (no live DB required)
1. **Authentication and abuse resistance:** review `src/server/mysql-login.ts` for network/IP rate limiting, uniform public error responses and timing behavior. Preserve its existing email-keyed SQL throttle. Add mockable, bounded enforcement and negative tests before enabling public authentication.
2. **Admin and tenant isolation:** inventory routes for explicit organization selection, tenant scoping, owner/admin/viewer enforcement, legacy fail-closed routes, connector health and feature-switch authority.
3. **Content and publication workflow:** validate draft → research → rights/quality review → human approval → scheduled state, plus revocation and revision invalidation. Approval must never dispatch or publish by itself.
4. **Monetization and safety:** verify plan entitlements, quota-v2, zero-default budgets, spend caps, paid-provider disabled defaults and emergency pause.
5. **Responsive product UI:** audit portfolio, website onboarding, approvals, automation, costs, connector health and settings for Android Chrome/tablet.
6. **Offline regression:** run Node 22 typecheck, test, security refusal suites and clean build in a supported non-production workspace; record command, exit code and logs.

## Release-blocking gates — deferred, not passed
- MariaDB 11.8 candidate 010–014 installation, two-session contention, rollback/unknown COMMIT, grants and populated backup/restore.
- Independently trusted issuer/key custody, monotonic fence and revocation, real budget/session authority, authenticated two-organization staging.
- No activation of publication/automation, no production credentials, no merges, no deployments, no CI enablement or paid services without explicit authorization.

## Working rule
Implement each remaining feature with an isolated commit, tests and recorded evidence. Do not equate mocked/offline passes with real database or production certification.
