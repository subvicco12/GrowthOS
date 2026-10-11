# GrowthOS pre-release security findings

Status: **NOT CERTIFIED; no deployment authorization**. Updated after checking the current development branch.

## Resolved in code: legacy WordPress adapters fail closed

- `src/app/api/dashboard/route.ts` responds HTTP 503 without initializing the legacy WordPress client.
- `src/app/api/approvals/route.ts` responds HTTP 503 without performing an approval.
- Maintain this behavior until tenant-bound authenticated replacement routes are reviewed. Add regression tests; do not reopen the endpoints without authorization.

## Open security and release gates

1. Login throttles by normalized email only. Add bounded network-level anti-abuse and examine authentication timing and generic errors.
2. Review CSRF and session-cookie protections for every mutating route, including logout and approvals.
3. Replace implicit first-organization selection with explicit authenticated workspace selection before multi-org release.
4. Verify every admin API enforces organization-scoped authorization and role-specific permissions server-side.
5. Confirm approval decisions never trigger publication; retain append-only audit behavior.
6. Review cost reservations, concurrency, reconciliation, overage handling and zero-budget fail-closed defaults.
7. Complete dependency install, typecheck, unit tests, production build and API security tests without incurring paid CI minutes.
8. Database integration and MariaDB execution testing are **deferred** by user direction; do not infer database readiness.
9. No production rollout, merge, Hostinger mutation, DNS change, paid provider call, or public feature activation without separate approval.
