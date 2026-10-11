# Growth OS remaining-work register (database integration deferred)

Status: **development backlog, not production-certified**. Hostinger DB migration and isolated MariaDB execution are explicitly deferred by user direction. No merges, deployments, or production modifications authorized.

## Verified repository findings
- Legacy global `/api/dashboard` and `/api/approvals` routes already fail closed with HTTP 503; older security finding claiming they are exposed is stale.
- `src/server/mysql-login.ts` uses an email-keyed database throttle. Network-level anti-abuse and uniform authentication timing remain to be implemented and tested.
- `src/server/mysql-owner-bootstrap.ts` is CLI/maintenance-only; must never be exposed as a public HTTP bootstrap route.
- `src/server/mysql.ts` requires server-only credentials and does not connect until configured.

## Next non-database work
1. Update stale security findings and ensure legacy routes remain fail-closed.
2. Harden public login: bounded IP/network rate limits, generic error behavior, timing analysis, CSRF/session security review.
3. Review explicit organization/workspace selection; avoid silently choosing first organization.
4. Audit tenant scoping and role checks for every admin route.
5. Review content approval flow and ensure approval does not publish.
6. Add tests for API auth/authorization, budget cap and feature switches using mocks; no live DB required.
7. Run typecheck, unit tests and build when dependency installation is available; avoid billed GitHub Actions.
8. Defer Hostinger read-only live inventory, MariaDB test execution, migrations, owner provisioning and production acceptance until separately resumed and approved.

## Controls
Keep all sites draft/inactive by default, budgets zero, automation and auto-publishing disabled. No billing, public signup, paid provider calls, Hostinger changes, DNS edits, merge, or deploy.
