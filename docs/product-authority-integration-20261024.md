# GrowthOS product authority integration — 24 October 2026

Production status: **HOLD / NO-GO**. This branch adds application code and a review-only SQL candidate. It does not install candidate schema or establish production trust.

## Implemented offline

- Manual intelligence evidence POST/GET/PATCH: server session and selected organization supply identity; owner/admin/editor may ingest, owner/admin may revoke, viewer may read. All SQL selects and writes bind organization and website. Input is bounded by the existing JSON reader and a strict 20-page schema. The server checks HTTPS page/canonical host against the selected website. Manual evidence is always `unverified` and cannot authorize spending, automation, approval or publication.
- The SQL adapter locks the website, compares the tenant-scoped idempotency key and payload hash, writes evidence and an append-only ingestion event in one transaction. Revocation appends a distinct event under an evidence lock. Failed audit insert rolls back. Expired or revoked records remain readable with explicit state. Missing candidate tables return service unavailable.
- Plan decision contract reuses the existing entitlement engine. It requires an independently supplied current plan verifier and refuses absent/revoked/expired/cross-tenant plan evidence, unknown usage, global pause, kill switch, quota exhaustion and website mismatch. No production verifier or plan issuer is wired; no plan assignment or paid reservation endpoint exists.
- Existing connector issuer, signed probe, revocation and independent-anchor contracts remain unchanged. The first-party connector UI continues to report unknown without verified persisted evidence. The hardened legacy connection-status route remains read-only and authenticated.

## Candidate 015 review inventory

`database/proposals/product-authority-v1/015_product_authority_candidate.sql` is **not registered with any installer**. It proposes seven additive InnoDB tables: `growth_intelligence_evidence`, `growth_intelligence_evidence_events`, `growth_plan_assignments`, `growth_plan_assignment_events`, `growth_plan_usage`, `growth_plan_usage_events`, and `growth_plan_usage_transitions`. It adds eight immutable history/evidence triggers and tenant-scoped composite keys. Existing migrations 001–014 and their hashes are untouched. Installation order, collations, trigger syntax, FK compatibility, exact inventory, backup/restore grammar and partial-DDL recovery require independent MariaDB 11.8 certification. Candidate 015 must be reviewed against concurrent schema work before assigning its final migration number.

Proposed grants: the runtime evidence reader needs `SELECT` on evidence/events and websites; the manual evidence writer needs scoped `SELECT` and `INSERT` on evidence/events, never UPDATE/DELETE on immutable tables; a separate plan issuer alone may write plan assignment and journal; a separate usage principal may reserve and settle usage. Ordinary organization viewers receive no direct SQL privileges. Database grants alone do not enforce row-level tenancy; server session checks and scoped SQL remain mandatory.

Expanded backup certification must include all seven new tables and eight triggers, per-table deterministic content hashes, event/revocation integrity, FK checks, same-version restore refusal tests and independently trusted issuer/anchor reconciliation. Existing certified backup packages must not be silently reused for this expanded inventory.

## Blocked boundaries

- Node 22 dependency installation and disposable two-session MariaDB 11.8 were not available in this Work environment. Mocked SQL tests do not certify locking, trigger behavior, collation or recovery.
- Candidate 010–014 and candidate 015 are review-only, not installed. The evidence API is fail-closed until a certified database exists.
- A trusted plan issuer, signing-key custody, independent revocation/fencing, plan assignment CAS, durable atomic usage settlement and quota-v2 publication funding are not implemented here. The plan decision contract alone does not grant a paid tier.
- Trusted connector-health display needs a current signed destination-bound observation checked against the independent anchor; the unsigned health projection cannot be treated as proof.
- Authenticated production-equivalent staging, live provider evidence and release approval remain separate gates. No publishing or automation was enabled.
