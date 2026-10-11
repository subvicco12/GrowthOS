# GrowthOS MySQL authentication rollout

Status: **development only, untested, not production-approved**.

## Database preparation

Apply MySQL schema scripts in ascending order in a **dedicated, empty** MySQL 8+ database:
`database/mysql/001_core_schema.sql`, `002_budget_incidents.sql`,
`003_sessions.sql`, `004_login_throttles.sql`, `005_installation_state.sql`.

Do not apply historical PostgreSQL migrations. Do not create a paid Hostinger resource or
run production SQL without explicit approval.

## Owner provisioning

`bootstrapInitialOwner` is a server-only maintenance function, **not** a web endpoint.
It requires an empty installation with the singleton state row present. Supply credentials
through a secure interactive/secret channel; never put plaintext passwords into git,
SQL migrations, build logs, or public environment variables. The bootstrap transaction
creates the owner, membership and organization budget, which remains paused with a zero cap.

## Login

`POST /api/auth/login` requires an HTTPS same-origin request. It issues a Secure,
HttpOnly, SameSite=Lax, twelve-hour opaque session cookie after successful authentication.
`POST /api/auth/logout` revokes that session. No signup endpoint exists.

## Outstanding release gates

- Execute TypeScript compilation and unit tests, then real MySQL integration tests.
- Test concurrent bootstrap, failed-login persistence, expiry, revocation, and tenant isolation.
- Add network-aware throttling (account-only limits do not stop distributed credential stuffing).
- Review reverse proxy Host validation and HTTPS handling, plus CSRF and cookie lifecycle.
- Test migration compatibility with the actual Hostinger MySQL version and backup/restore.
- Validate provider-cost reconciliation and spending caps under concurrency.
- Ensure server-only modules cannot enter client bundles; no database secrets in public variables.
- Implement password reset/recovery and secure account lifecycle policy before production.
- Obtain explicit approval before provisioning, deployment, DNS changes or merging to main.
