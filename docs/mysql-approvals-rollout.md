# GrowthOS MySQL internal approvals rollout

## Implemented on feature branch (not deployed)

- Migration 006 creates the organization- and website-scoped approval queue.
- Migration 007 creates a decision audit table with unique organization-scoped idempotency keys.
- GET /api/admin/approvals lists only authenticated organization records.
- POST /api/admin/approvals/decide accepts organizationId, websiteId,
  approvalId, idempotencyKey, decision (approved/rejected/deferred), optional note.
- POST requires a server-verified session and organization role authorized for
  publish-level operations. It derives actorId from the session, not JSON.
- POST requires the exact HTTPS Origin configured in GROWTHOS_APP_ORIGIN.
- Decisions serialize on the organization row, check the existing idempotency
  key, lock the pending approval, append a decision event and update queue state
  in the same transaction. Replays with identical details return the original ID.
- Internal approval is **not** permission to publish. No external action occurs.

## Important release blockers

1. Run migrations 001, 002, 003, 004, 005, 006 and 007 in an approved
   dedicated MySQL test database, in order. PostgreSQL prototypes are obsolete.
2. Execute typecheck, tests, Next.js build, and MySQL integration tests for
   simultaneous conflicting decisions, same-key replay, tenant isolation,
   transaction rollback, and authorization.
3. Add database-enforced append-only privileges or triggers for the audit
   table; application code alone cannot make it immutable.
4. Review and confirm role policy for approving versus publishing.
5. Add website-specific integration ownership verification before enabling
   any external publishing. Keep all new websites inactive with zero budgets.
6. Validate GROWTHOS_APP_ORIGIN and reverse proxy configuration in staging.
7. No production deploy or migration without operator approval.
