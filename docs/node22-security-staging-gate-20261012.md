# GrowthOS — Node 22, security and synthetic staging gate

**Status: NOT CERTIFIED.** Branch: `feat/ci-cost-guardrails-20261011`. No deployment or production access is authorized.

## Evidence reviewed
- Current GitHub source: `src/server/mysql-session.ts`, `src/server/mysql-organizations.ts`, `src/server/organization-context.ts`, `src/server/mysql-approval-decision.ts`, `src/app/api/website-features/route.ts`, `src/app/api/organization-approvals/route.ts`, `src/core/__tests__/mysql-approval.integration.test.ts`.
- Prior isolated MariaDB 11.8.5 tests passed on **Node 24.19.0**, not Node 22; see `docs/isolated-mariadb-runtime-20261012.md`.
- A separate older ZIP snapshot is not an acceptable substitute for testing the current GitHub branch.

## Node 22 parity procedure (not yet executed on current branch)
1. Obtain a clean checkout at a recorded SHA of this development branch in an isolated environment with Node 22 and no production credentials.
2. Record `node --version`, `npm --version`, `git rev-parse HEAD`; verify Node major is 22.
3. Execute sequentially: `npm ci --ignore-scripts --no-audit --no-fund`, `npm test`, `npm run typecheck`, `npm run build`, `npm run test:security:offline`, `npm run test:db-guards:offline`, `npm run migration:plan`.
4. Record exit codes, counts, full failure messages and package-lock consistency. Do not run GitHub Actions.
5. If full Node 22 database parity is required, use a new verified disposable MariaDB 11.8.x schema and the guarded runner; never reuse an existing migrated schema.

## Static security review (source-inspection findings, not runtime certification)
- Session token stored as SHA-256 digest; verification checks revocation, expiry and disabled user.
- Organization is selected through a verified session and membership lookup, not caller identity headers.
- Feature-disable route checks HTTPS same-origin, authorization, input schema and organization-scoped row lock; updates and audit insert share a transaction.
- Approval queue read endpoint filters by organization and pending status; no mutation is exposed by that endpoint.
- Approval decision helper uses parameterized queries, organization lock, idempotency checks, and scoped approval lookup. It is an internal helper and relies on its caller to authorize the actor.
- **Review concern:** The feature-disable route compares `Origin` against the incoming `Host` header. Before staging approval, verify behavior behind the actual reverse proxy, trusted-host configuration and any legitimate forwarded-host rewriting; do not weaken origin enforcement as a workaround.
- **Review concern:** Confirm any future public caller of `decideInternalApproval` performs role and membership checks before calling it. Current internal helper is not itself an authorization boundary.
- **Review concern:** Verify cookies are set with `HttpOnly`, `Secure`, appropriate `SameSite` and Path in the issuance route, not only in documentation.

## Synthetic authenticated staging test matrix (NOT EXECUTED)
Create isolated staging only, using synthetic users and two synthetic organizations, never production data.
1. Unauthenticated GET approvals => 401; invalid or expired session => 401.
2. Missing organization choice => 403; membership in organization A cannot access B => 403.
3. Viewer attempts feature-disable => 403, no update/audit.
4. Owner/admin disables enabled automation => 200, feature false, one audit event; repeat => 200, no extra audit.
5. Owner/admin disables auto-publish => 200, feature false; no enable endpoint or publishing side effect.
6. Cross-tenant website ID => 404, no update/audit.
7. Missing/mismatched/non-HTTPS Origin => 403, no update/audit.
8. Invalid JSON/feature values => 400; malformed or oversized request should fail closed.
9. Audit insertion failure => transaction rollback, feature unchanged.
10. Approval inbox returns only pending records for selected tenant; responses carry no-store.
11. Revoked/disabled session cannot access APIs; verify cookie attributes and logout revocation.
12. Concurrent decisions and replay remain covered by the isolated MariaDB integration suite; staging must not enable external publishing.

## Release hold
Node 22 current-branch execution, synthetic authenticated staging, production schema review, backup/restore rehearsal, rollback plan and explicit deployment approval remain OPEN. No GitHub Actions, merge, Hostinger/Paddle changes, external database connection, paid service or automation activation permitted.
