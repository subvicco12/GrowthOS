# GrowthOS database architecture — Hostinger MySQL

**Selected provider:** Hostinger MySQL (subject to plan capacity and network access). **Engine:** MySQL 8-compatible InnoDB. **Status:** code only, not deployed.

## Active migration path

- `database/mysql/001_core_schema.sql` is the MySQL schema baseline for a **new dedicated empty database**.
- `database/migrations/001_*.sql` through `005_*.sql` are **obsolete PostgreSQL/Supabase prototypes**. DO NOT EXECUTE them. They are retained temporarily for historical comparison; remove after replacement validation.
- `src/server/mysql.ts` is a server-only connection pool. Set `GROWTHOS_DB_HOST`, `GROWTHOS_DB_PORT`, `GROWTHOS_DB_USER`, `GROWTHOS_DB_PASSWORD`, `GROWTHOS_DB_NAME` as server secrets. Do not use `NEXT_PUBLIC_` credentials.
- `package.json` removes Supabase SDK dependencies and introduces `mysql2`. Lockfile generation and dependency installation remain pending.

## Required implementation before activation

1. Confirm Hostinger MySQL 8 compatibility, database capacity, network connectivity from the chosen Hostinger web app, TLS options and backup/restore capability.
2. Add secure session authentication (Argon2id password hashes or equivalent), CSRF protection, rate limits, login/session expiry, and organization-scoped role checks. The schema stores password hashes but **no authentication endpoint is implemented**.
3. Implement MySQL transactions using `SELECT ... FOR UPDATE` on organization budget row **before** any site reservation, including all organization websites. Recheck caps and insert reservation within the same transaction; retry deadlocks conservatively.
4. Implement finalized cost reconciliation, audit events, cost-overrun exception handling and weekly/monthly period boundaries. A monthly content-type cap and organization-wide cap must both be checked.
5. Use parameterized SQL, least-privilege database users, encrypted backups, integration tests and concurrency tests. No AI provider call may start without a durable reservation.
6. Authenticate admin routes server-side; never trust organization IDs, role names or user IDs supplied by the browser.
7. Disable production jobs and all automatic publishing until the release gates pass.

## Cost and rollout guardrails

No paid resources, live databases, deployments, merges or DNS changes without explicit approval. One central database can serve multiple websites with tenant keys; the app must not create one database per website. No billing or subscription features.
