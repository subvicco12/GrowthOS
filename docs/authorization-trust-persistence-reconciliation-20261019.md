# Authorization/trust persistence reconciliation — review only

Production HOLD / NO-GO. This branch does not merge, install or alter any source/certification branch. The blueprint (sections 22–25, 28, 32, 38–43, 49–51) and all four pinned branch heads were inspected.

## Lineage and frozen packages

| Read-only source | Verified SHA | Shared ancestry / contract |
| --- | --- | --- |
| Approval/connector bridge | `88e11d23d26d61759d551bfeab5ab7920b6649de` | Primary parent of this branch; approval records were proposed, issuance and ingestion missing. |
| MariaDB persistence | `e5b2c9678bb57817ba6a18e0f85df681f8c4e8e6` | Diverges from primary at `ae1ccce603f7080c44e0c2025b00ce62105e8888`. Candidate 010 only; live certification BLOCKED. |
| Expanded backup v1 | `3e7d7622cb672beb6025a146cae2396baa3cc063` | Descendant of the MariaDB source above. Frozen 20-table archive, not a generic SQL restore. |
| Quota/settlement | `bd4d08c36b4c2c0d2a909d42377be048e9779d47` | Diverges at the same integration commit. Site-local week and bigint journal contract, no durable adapter installed. |

010 SHA-256 remains `bb10b32ec0186399ae10b1820541d4330aab500843cd0fcf2a82b4da515c2c5b`; its blob was read/hash-checked from the certification commit, not copied into or executed from this branch. The nine certified migrations and ledger package remain untouched. Expanded backup v1 contract hash remains `17ce94be57e677190522341bf011195eba889938a89ec83cce99d8a589e17786` per its source evidence; it was not re-certified here.

## Separately reviewable additive 011

`database/proposals/011_authorization_trust_candidate.sql` is framed review DDL only. Provisional number 011 requires independent coordination with quota work. SHA-256: `7b9f5b15d2797c13bc6c30d04a08d49b5112a2545f264b543e86ffd5b303362a`. No executor registers or installs it. `011_authorization_trust_manifest.json` enumerates every exact table, named index/PK, FK tuple and trigger; `scripts/verify-authorization-trust-proposal.cjs` verifies its hash/inventory, refuses execution arguments and does no database access. This verifier is not a MariaDB SQL parser or an independent approval of the hash it ships with.

| Added table | Indexes (including PK) | FK columns | Triggers | Purpose |
| --- | ---: | ---: | ---: | --- |
| `growth_publication_policy_revisions` | 2 | 4 | 2 | Current feature flag/revision with monotonic revision_number; disabled default. |
| `growth_publication_destinations` | 2 | 2 | 2 | Scoped canonical account/site target; disabled default; immutable identity and increasing revisions. |
| `growth_connector_issuer_state` | 1 | 0 | 2 | DB projection of issuer/key generation and irreversible revocation; default revoked. It is NOT the rollback anchor. |
| `growth_connector_evidence_history` | 4 | 6 | 2 | Immutable signed v2 probe envelopes; unique issuer/key/event and issuer/key/sequence. |
| `growth_connector_attestations` | 3 | 7 | 2 | Monotonic current pointer with scoped destination/history FKs; no clearing revocation. |
| `growth_content_authorizations` | 8 | 16 | 3 | Immutable reviewed JSON/scalars; scoped source event, reservation, destination, approver and claim FKs; only unused -> consumed OR revoked. |
| `growth_publication_authorization_events` | 3 | 4 | 2 | Append-only issuance/revocation and unique org request key. |
| `growth_publication_authorization_uses` | 6 | 13 | 2 | Append-only use binding both authorization source tuple and consumed claim hash; one use per scoped approval event. |
| **Addition** | **29** | **52** | **17** | Eight tables, 25 framed DDL statements. |

After reviewed 001–010, the planning inventory would be **28 InnoDB tables, 28 triggers, 92 FK columns and 11 migration ledger entries**. These are unexecuted counts, excluding the three separately proposed quota-v2 tables and any later migration. Ledger 011 must be added only by a separately reviewed installer after ALL DDL and independent inventory checks succeed; this file writes no ledger entry. DDL implicitly commits: partial installation requires abandonment and a fresh disposable schema, not a retry/reset.

All tables use InnoDB/DYNAMIC; organization/site/user/reservation IDs use CHAR(36), utf8mb4_uca1400_ai_ci to match 010's explicit 11.8 assumptions. Content/event/destination/issuer keys use bounded utf8mb4_bin; channel and SHA-256 fields use ascii_bin. Every child FK has an explicitly named covering index, avoiding reliance on implicit server-created indexes. The largest declared composite index is 2336 modeled bytes (auth source tuple); indexed widths, inherited FK compatibility, CHECK/SHA2 support, collation, row format and 16KiB pages require real MariaDB validation. JSON scalar mirrors, immutable journals, terminal/identity guards, no deletes and monotonic pointer/revision guards are proposed, not live-tested protection.

## Service/principal separation (proposed least privilege)

No grants were executed. Use different actual principals/pools, not a shared broad runtime account. Column grants and explicit FK/trigger behavior need live certification.

| Principal | Required reads | Allowed writes | Never allowed |
| --- | --- | --- | --- |
| Authorization issuer | Current session/users/memberships, scoped budget/site/content/policy/reservation/destination, immutable approval events, connector/trust snapshots; authorizations/events | INSERT authorizations and authorization_events; UPDATE only authorization.revoked_at | Claims, uses, content transitions, probe history/pointers, trust generations, site/policy enablement, spend, DDL/DELETE. |
| Connector evidence writer | Scoped budget/site/destination and preprovisioned issuer state; current/history evidence | INSERT history/current and legacy health; UPDATE only pointer event_id/sequence/payload_hash/signed_json and legacy health status/check/expiry | Authorization issuance/revocation/use, claims, reservations, site/policy switches, issuer trust/key provisioning, DDL/DELETE. |
| Claim consumer | Current auth/session/member/policy/destination/probe/trust/reservation/content snapshots and independent lease checkpoint | Existing 010 claim/content/event writes; UPDATE only authorization.consumed_at/claim_hash; INSERT authorization_uses | INSERT authorizations/issuance audit, revoke/reset authorizations, probe/trust writes, spending or activation, DDL/DELETE. |
| Trust administrator | Independently authorized control-plane identity and anchor state | Irreversible anchor revocation first; DB trust/revocation projections and audit only through reviewed operator process | Un-revoke, lower generation, clear pending checkpoints or authorize publishing. Audit failure retains revocation and requires incident handling. |
| Installer / metadata administrator | Independently verified disposable schema | Reviewed DDL or separately approved revision/destination provisioning | Reuse as a runtime principal, automatic production migration, credential/report leakage. |

Application capability discriminants reject wrong store roles, but are not proof of database grants. SQL privileges are a separate gate. Users remain organization members under the certified schema; website-specific entitlements were not invented.

## Anchor, crash and recovery protocol

`IndependentTrustAnchor.exclusive` MUST provide a durable, cross-process, non-reentrant exclusive lease per issuer/key, outside the SQL backup rollback domain. `compareAndSet` must be linearizable, monotonic, durable before success and preserve irreversible revocation. There is deliberately no default filesystem or in-memory production implementation. The test anchor is an explicit simulation only. No trustworthy anchor means no ingestion and no claim.

Ingestion snapshots input before any await, verifies base and v2 control signatures, registry scope/capabilities/generation, freshness and sequence/previous hash. It durably records a pending checkpoint BEFORE SQL. The SQL writer then commits immutable history, pointer and legacy denial projection atomically. Readback must match; only then may the anchor finalize. Failed/lost commits leave pending. Only the exact still-valid envelope may recover; expired pending work requires independent operator review, not TTL bypass or anchor clearing.

The entire claim/issuance SQL transaction must run inside `withClaimLease`, obtaining the independent lease BEFORE any SQL row lock. Its checkpoint expires when the callback returns and is checked again at consumption. This prevents cooperating revocation/ingestion from racing the decision and avoids SQL->anchor vs anchor->SQL lock inversion. Missing, pending, revoked or mismatched anchor/current/history evidence denies. A restored older SQL snapshot cannot reset sequence, resurrect a revoked key or make a self-reported health hash authoritative. Anchor/service/DB restarts and audit failures require incident-aware reconciliation; no outbound operation is retried by this protocol.

Key rotation cannot overwrite an old issuer/key pointer or undo revocation. Provision a new reviewed registry/key/anchor and destination identity/revision, revoke the old key first, and re-review affected content. A general rotation/provisioning UI and automated rollback recovery are NOT implemented. The anchor backend's own disaster recovery/anti-rollback guarantee remains an infrastructure gate.

## Compatibility decisions and safest integration sequence

1. Review this branch without merging sources or activating the route. The route is deliberately wired to unavailable (503); the injectable HTTP service has only synthetic execution evidence. No automatic fake persistence or fallback exists.
2. Reconcile migration numbering and choose an independent anchor backend/key custody model. Separately review/prove 010 in disposable MariaDB first; preserve all baseline bytes/hashes and four original triggers. Its old prepared application harness must be versioned for the new issuance, anchor and execution guard requirements—it cannot simply be reused unchanged.
3. Integrate/certify the durable quota/settlement adapter. Preserve UTC portfolio months, explicit IANA/rules snapshots, bigint currency and conservative unknown-execution holds. A completed `growth_ai_reservations` generation record is not a v2 publishing funding receipt, does not prove per-channel quota and does not authorize another charge. `PublicationExecutionGuard` is mandatory and missing by default; no bridge to v2 or provider ceiling is fabricated. Reconcile any extra receipt/schema fields in a separate versioned review.
4. Independently review/install 011 ONLY in a new disposable test schema after 010. Validate every FK/index/trigger, JSON/scalar mirror, role grant, two-session issuance/consumption/revocation race, checkpoint ordering, deadlock, disconnect/rollback and partial-DDL refusal. Do not install candidate DDL as part of an application build.
5. Version expanded backup/recovery for the larger inventory and new JSON/history/terminal semantics. Existing expanded-backup-v1 freezes exactly 20/11/40/10 and therefore is **incompatible by contract** with 011; no live compatibility test was executed. Preserve that refusal. Independently retain/reconcile the external anchor; never import trust liveness from an older SQL archive. Do not amend existing backup validators to silently accept new tables.
6. Provision distinct least-privilege principals, trusted registry/capabilities, monotonic policy/destination writers and authenticated preview/consent UI under separate review. Bind actual server cookies, never JSON actor/role/digest. Wrap issuance and claims with the full independent lease. Revocation must remain available under feature shutdown, with fresh session/membership.
7. Execute Node 22 parity and fully isolated authenticated staging. Only after all independent release gates and explicit approval consider production changes; publishing, workers and providers remain off throughout this development work.
