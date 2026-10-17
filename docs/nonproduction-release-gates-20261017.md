# GrowthOS non-production release gates — 2026-10-17

**Decision: HOLD / NO-GO.** Source revision `eadc9ee77ffb267e97547488a749483233e29c71` on `feat/ci-cost-guardrails-20261011`. No production connection, credentials, deployment or activation was used. Node.js `v22.16.0` in a clean checkout. The previously certified disposable MariaDB dump and restore was not repeated.

## Executed gates

All commands below ran in the clean checkout with `/tmp/growthos-current/package/bin` first on `PATH`.

| Command | Exit | Observed result |
| --- | ---: | --- |
| `npm ci --ignore-scripts --no-audit --no-fund` | 0 | 58 packages installed |
| `npm test` | 0 | 215 tests: 214 pass, 0 fail, 1 skipped |
| `npm run typecheck` | 0 | `tsc --noEmit` |
| `npm run build` | 0 | Next.js 15.5.24 compiled and generated six static pages |
| `npm run test:security:offline` | 0 | Offline source checks pass; no database/network |
| `npm run test:db-guards:offline` | 0 | Eight refusal cases pass; no authorized connections |
| `npm run migration:plan` | 0 | Nine migrations and hashes printed; plan only, no connection |
| `npm run test:auth-cookies:offline` | 0 | Four mocked cookie/origin cases pass |
| `node scripts/test-feature-route-mocked.cjs` | 0 | Nine mocked feature cases pass |

## Source security review

- Sessions use random tokens with stored SHA-256 hashes, expiry, revocation and disabled-user checks. Login sets `HttpOnly; Secure; SameSite=Lax`; logout revokes the server-side token and expires both cookies. The four offline cookie cases pass.
- Organization selection checks current memberships; website reads and writes scope by organization. Registration is draft-only, with `automation_enabled` and `auto_publish_enabled` false. Feature mutation accepts disable only, requires owner/admin, locks the scoped row and inserts an audit entry in the transaction. The nine mocked cases cover viewer refusal, idempotency and audit rollback.
- Approval decision derives actor from authenticated membership, requires an exact configured HTTPS `GROWTHOS_APP_ORIGIN`, constrains the body and uses organization/site scoped row locks and idempotency. No external publishing action is in that helper. The unit suite covers unauthorized roles and replay behavior; this is not authenticated staging evidence.
- Login, logout, organization selection and registration/feature writes compare HTTPS `Origin` to request `Host`. Their safety behind a reverse proxy requires a verified canonical Host policy and trusted proxy configuration. This deployment property is unverified. Login, selection and registration also parse JSON without an explicit body-size limit; request limits at the edge are unverified. These are release security review items, not claims of an executed exploit.
- Publishing/automation activation was not exercised. The reviewed registration and feature write paths only create disabled drafts or turn a feature off. Full runtime and configuration verification remains an independent staging gate.

## Staging and compatibility

No independently verified isolated staging endpoint, synthetic credential set or two-organization fixture was available in this checkout. Authenticated owner/admin/viewer E2E, cross-tenant denial, session revocation, CSRF, approval replay, unsafe requests and audit checks remain **NOT RUN**. Provision and independently verify synthetic-only staging, then capture request/response evidence and database audit state while both publishing and automation are disabled.

For a separately authorized read-only production metadata review, independently establish the dedicated schema identity before running `database/mysql/000_growthos_prod_metadata_preflight.sql`; compare server version, default charset/collation, tables and engines, columns/defaults, indexes, FK targets/rules and trigger names/timing against migrations 001–009 and nine pinned hashes. Require an empty target for first installation, no unexpected objects or drift, and compatible trigger privileges. `database/mysql/000_read_only_preflight.sql` references a different legacy schema and must not be used as the dedicated target inventory. No production query was executed here.

## Database privilege and recovery specification

- **Installer identity:** dedicated schema only; migration/ledger installation needs `CREATE`, `INDEX`, `REFERENCES`, `TRIGGER`, `SELECT` and `INSERT` on the target, plus the metadata visibility required by preflight. Verify exact statement-by-statement grants before authorization; do not add `ALTER` unless a separately reviewed statement actually needs it. No global grants, `FILE`, `SUPER`, routine or event privileges. Revoke installer access after installation. Trigger definer/restore behavior must be checked with the provider.
- **Runtime identity:** dedicated schema only, `SELECT`, `INSERT`, `UPDATE` scoped to application tables required by authenticated routes and the separately controlled bootstrap/budget paths. No `CREATE`, `ALTER`, `DROP`, `TRIGGER`, `INDEX`, `REFERENCES`, `GRANT`, `FILE`, `EVENT`, or audit-row `UPDATE`/`DELETE`; avoid `DELETE` entirely unless a reviewed application operation demonstrably requires it. Narrow to per-table and, where supported, per-column grants after a clean synthetic rehearsal. Distinct backup operator identity with only the provider-required read/export permissions.
- **Operational owner and objectives:** name a recovery decision owner and alternate, backup operator, incident commander, and approver. Record backup schedule, retention, offsite/encryption/access controls, alerting for failed jobs and ledger/schema drift, plus measured restore time and data loss from a separate destination. RPO/RTO are **unset**, not achieved. Define alert routing and a tested restore authorization path before GO.
- **Partial DDL:** stop writes/execution at first failure; preserve statement and ledger logs, inventory actual metadata read-only, prohibit automatic retry or destructive production cleanup, then require incident-specific reviewed forward repair or provider restore to an approved destination. Reconcile nine hashes, 15 InnoDB tables, four audit triggers, 23 FK columns and audit immutability before a fresh GO decision.

Remaining independent gates: verified staging E2E and proxy/edge policy, provider backup retention and ownership, measured recovery, exact installer/runtime grants, fresh metadata compatibility, operational monitoring and explicit release approval. This evidence does not authorize any production work.
