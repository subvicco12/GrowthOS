# GrowthOS pre-release security blockers

Status: **unresolved; no deployment authorization**.

## Critical: legacy WordPress adapter endpoints

The existing `src/app/api/dashboard/route.ts` and
`src/app/api/approvals/route.ts` currently initialize a configured
WordPressGrowthOSClient without the new MySQL session and organization
membership checks. The approvals route can initiate approval decisions.
**Do not deploy with these endpoints exposed** until they enforce
server-verified user identity, per-organization website ownership,
action-specific RBAC, CSRF protection and trusted actor attribution.

## Other gates

- Login currently throttles by normalized email only; add a bounded
  network-level anti-abuse control and generic authentication timing.
- The admin budget view chooses the first member organization; add an
  explicit authenticated workspace selector before multi-org release.
- Reconciliation and reservation functions are server-only building
  blocks; their callers must enforce organization and job authorization.
- Monetary summaries rendered as JS numbers need safe bounds/formatting
  for very large values; do not silently round.
- Run local typecheck, unit tests, build and real MySQL integration tests.
- Test concurrent reservations and login lockouts.
- Verify MySQL migration and database backups before provisioning.
- Obtain approval before enabling any public route or deploying.
