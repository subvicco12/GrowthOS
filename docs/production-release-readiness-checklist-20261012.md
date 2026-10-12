# GrowthOS — production release-readiness checklist (2026-10-12)

**Decision: HOLD — no production release authorization.**
Repository: `subvicco12/GrowthOS`; branch: `feat/ci-cost-guardrails-20261011`.

## Verified isolated evidence
Source: `docs/isolated-mariadb-runtime-20261012.md` (commit `8d38c04ccbac8ea9e257ce174d010fac95a4de0b`).
- MariaDB 11.8.5 isolated server, networking disabled; nine migrations, 15 InnoDB tables, four immutable audit triggers, 23 FK columns: PASS.
- Approval integration: one test, zero failures, concurrency, replay, idempotency conflict, tenant boundary, audit checks: PASS.
- Eight negative database safety guards: PASS.
- `npm ci`, `npm test`, `npm run typecheck`, `npm run build`: PASS in Node 24.19.0 environment.
- Disposable server, credentials and scratch data removed. No production connectivity.

## Gates before release

| Gate | Status | Evidence required | Restrictions |
| --- | --- | --- | --- |
| Node 22 parity | OPEN | Clean isolated checkout, `node --version`, `npm ci --ignore-scripts --no-audit --no-fund`, `npm test`, `npm run typecheck`, `npm run build`, `npm run test:security:offline`, `npm run test:db-guards:offline` with exit codes | No GitHub Actions or paid CI |
| Branch integrity | OPEN | Exact branch SHA and reviewed diff from intended base, no secrets committed, no unreviewed changes | No merge |
| Production schema compatibility | NOT AUTHORIZED | Approved read-only schema metadata export, compare tables/columns/indexes/FKs/triggers to migration expectations; record drift and proposed non-destructive plan | No connection or export until explicit approval; no schema writes |
| Backup and restore | NOT AUTHORIZED | Approved backup procedure and successful restore rehearsal to separate disposable destination, integrity and recovery time recorded | Never overwrite production or use live credentials without approval |
| Secrets and configuration | OPEN | Inventory of required variable names and permissions; secrets remain redacted; confirm least privilege and isolation | Never print credentials or connect to production |
| Authenticated E2E | OPEN | Staging-only synthetic accounts: owner/admin/viewer, cross-tenant rejection, CSRF/origin checks, feature disable audit and idempotency | No real accounts or production changes |
| Rollout and rollback | OPEN | Release checklist, stop criteria, rollback triggers, migration irreversibility review, explicit approver | No deployment |
| Final approval | NOT AUTHORIZED | All above gates signed off and explicit user approval | Do not infer approval from this checklist |

## Next safe execution sequence
1. Validate **Node 22 parity** locally or in isolated Work runtime, and record exact branch SHA.
2. Review development branch for secret leakage, role and tenant enforcement, and unsafe migration/rollback assumptions without production connections.
3. Build a synthetic staging E2E test plan; execute only if an isolated staging environment is available and verified.
4. Present evidence and request distinct authorization before **any** production metadata inspection, backup operation, merge, deployment, or live automation activation.

## Stop conditions
Stop on unexpected outbound connections, any production hostname/credential, paid resource request, non-disposable database, or a failed test. Never run GitHub Actions, merge, deploy, modify Hostinger/Paddle, or activate automations as part of this checklist.

**Result:** Isolated DB certification passed; production readiness remains blocked by open gates.
