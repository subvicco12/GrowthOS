# GrowthOS MySQL approvals rollout

## Current implementation

Migration: `database/mysql/006_approval_queue.sql`.
Read-only endpoint: `GET /api/admin/approvals?organizationId=<uuid>`.
Optional website filter: `websiteId=<uuid>`.

The endpoint validates identifiers, authenticates the session, checks the requested
organization membership, and selects rows constrained by organization ID.
It returns at most 100 rows and sets Cache-Control: no-store.

**Not implemented:** approval decision writes, recommendation ingestion,
website integration ownership proof, publishing, and external action execution.
The former global WordPress approvals endpoint remains disabled.

## Required before enabling decision writes

1. Explicit authorization matrix for approve/reject/defer, with the
   authenticated actor resolved server-side.
2. CSRF protection tied to a configured trusted application origin.
3. Atomic status transitions, idempotency keys, and immutable audit events.
4. Verify each approval's website belongs to the requested organization.
5. Separate human approval from permission to execute or publish.
6. No external execution until website-specific integration credentials,
   action scopes, kill switches and spending controls have been tested.
7. Run schema migrations only against an operator-approved empty/test database.
8. Validate unit tests, MySQL integration tests and concurrency behavior.

No migration has been applied and no production deployment is authorized.
