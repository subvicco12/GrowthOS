# GrowthOS static review — organization dashboard migration

Scope: feature branch feat/ci-cost-guardrails-20261011. Source inspection only. No build, GitHub Actions, MariaDB connection, migration, or deployment executed.

## Verified in source
- The primary dashboard page now renders organization-specific Home, Websites, Growth, and Automation components, plus a read-only Settings placeholder.
- The old hardcoded portfolio selector and /api/dashboard fetch were removed from the main page.
- Website registry, dashboard, and approval inbox SQL filter by the authenticated organization ID.
- Feature PATCH only accepts enabled=false; its update includes both website ID and organization ID.
- The approval inbox has no decision mutation handler. Registration defaults to draft, zero budget, and disabled automation and publishing.
- Unit test files for role restrictions, cross-organization membership rejection, and disable-only validation are present; execution is pending.

## Open issues and required gates
1. Database integration tests remain paused. Query compatibility and actual tenant isolation have not been demonstrated against MariaDB.
2. Isolated TypeScript syntax parsing was previously reported for 187 files; complete typecheck, Next.js build, and browser regression remain unverified because dependencies could not be installed. Source inspection and syntax parsing are not certification.
3. Approval decisions and immutable audit workflow remain inactive and untested.
4. Feature-disable transitions now have a dedicated audit table in migration 009 and a tenant-scoped transactional endpoint. Their behavior still requires isolated MariaDB integration tests before release.
5. The website domain validator checks DNS label syntax but not domain ownership, DNS verification, or public suffix validity.
6. The read-only Settings tab is intentionally a placeholder; tenant-scoped settings mutations remain unavailable.
7. The organization dashboard lists at most 100 websites but now queries a separate total count. Pagination remains to be implemented.
8. Origin/Host checks on write routes should be reviewed for reverse-proxy deployments and CSRF defenses before deployment.
9. The old disabled /api/dashboard endpoint and unused legacy components still exist in the repository. Confirm no remaining callers before deleting.
10. UI permissions are not a substitute for server-side role checks; maintain both in every new write endpoint.

Release recommendation: do not merge or deploy until static typecheck, build, security tests, database integration tests, and deployment acceptance gates pass. Do not enable automation, publishing, billing, or paid AI work during this review.
