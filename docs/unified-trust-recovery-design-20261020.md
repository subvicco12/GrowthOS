# Unified trust, quota and recovery decisions — independent review

**HOLD / NO-GO. Review proposals, no live certification.** All four supplied source SHAs were independently checked with remote refs. Primary/DB/quota share integration ancestor ae1ccce603f7080c44e0c2025b00ce62105e8888; expanded backup descends from e5b2c9678bb57817ba6a18e0f85df681f8c4e8e6. None is merged or modified here.

Blueprint source: uploaded Complete Master Blueprint & Architecture Bible, SHA-256 `1a04e0a2afae7545740948aeaadb876c0f972f5ae7720128ec2b662354ce8a92`; sections 22–25, 28, 32, 38–43, 49–51 govern tenant isolation, approval, safe disabled defaults, current connector evidence, chargeable execution, atomic caps and independent recovery gates. Existing integration, 010 certification, expanded v1 recovery, quota persistence, approval/connector proposal and authorization/trust evidence were reused. Historical planning language is superseded only by explicit decisions below, never silently treated as executed certification.

## Migration and application reconciliation

| Contract | Decision / incompatible assumption | Required gate |
| --- | --- | --- |
| 001–009 | Frozen 15/4/23/9 inventory; no byte changes. | Existing pins plus no-diff verification. |
| 010 | Retain source hash and numbering. Adds five tables, seven triggers and scoped legacy reservation index. | Real DDL/CHECK/FK/locking certification is still blocked in its own evidence. |
| 011 | Retain source bytes/hash and eight tables. Allocate 011 to authorization/trust. | Independently review SQL metadata and column grants before installation. |
| Quota-v2 | Reserve **012**, separate candidate in `database/proposals/unified-v2`; three tables, seven triggers, 22 FK columns. No installer registration. | DDL approval and actual MariaDB execution. |
| Legacy reservations | Completed generation reservation plus recorded cost does not fund a publication. | Mandatory execution guard must bind a separate v2 publication reservation to exact org/site/content/version/channel/destination/authorization and current ceiling. No adapter is fabricated here. |
| Authorization issuance | Server session, fresh owner/admin membership, durable content approval and version/destination/policy binding remain authoritative. Existing route stays 503/unconfigured. | Bind durable v2 funding and independent lease before enabling any route. |
| Connector state | Unsigned legacy health may deny only; issuer projection is not an anchor. | Signed registry capability/scope/revision/generation verification plus independent checkpoint for every issuance/claim. |
| Backup v1 | Exact 20/11/40/10 format refuses new tables. | Preserve its source and refusal; do not broaden it. |
| Unified recovery v2 | Separately versioned 31/35/114/12 data-only review contract. | No restore executor exists until terminal replay and independent trust reconciliation are certified. |

010/011 declared FK column types, widths and collations match in the offline model. CHAR(36) scope parents inherit utf8mb4_uca1400_ai_ci; bounded opaque IDs use utf8mb4_bin, hashes/channels ASCII binary. Proposed tables are InnoDB/DYNAMIC; baseline row format/collation must be established by the independently verified database defaults. Largest declared modeled key is 2336 bytes against a 3072-byte/16KiB-page planning ceiling. This does not establish MariaDB index creation or semantics. Exact declared identities are in the generated inventory; implicitly created index names remain BLOCKED until metadata observation.

### Limits of database-only enforcement

010 content/event/claim consistency is an application transaction invariant, not a cross-row SQL CHECK. 011 consumes authorization only in the claim/content/use transaction; terminal guards prevent reuse/reset. Its pointer FK names a history event, but SQL alone does not prove signature, payload hash, sequence, expiry or registry capabilities. The application reader checks those; restored pointers require independent verification again. Journal JSON validity alone does not authenticate an issuance or financial event. Existing legacy budget-incident reservation FK does not itself bind its organization; application scope and recovery validation must check that relationship. No certified migration is changed to hide these gaps.

Acquire the independent issuer/key lease BEFORE SQL locks. Then lock organization budget, website/policy and scoped content/reservation/claim/authentication rows in one reviewed order. Quota events across sites serialize on the same organization budget row. Financial posting verification requires a separate service principal. Consume authorization, unique claim, content/event transition, authorization-use evidence and funding start must commit atomically; the present separate stores do not yet implement that unified transaction. Revocation may still run under shutdown. Deadlocks require entire-transaction rollback and fresh authorization with identical replay IDs; unknown commit outcomes require readback, never a second provider call.

### Durable quota-v2 design

Store explicit IANA zone, reviewed rules version, local Monday and both resolved UTC week boundaries; DST may produce 167/169 hours. Ambiguous/nonexistent midnight, zone/rules overlap or unknown currency/budget refuses execution. Portfolio month remains the reservation's original UTC month, including late charges/refunds. Amounts are unsigned BIGINT-compatible decimal strings; aggregates use bigint/DECIMAL wide arithmetic, never Number or floating point.

Reserve atomically holds units plus estimate. Start once consumes units; cancellation/expiry before start release holds only after an explicit event. Started failures retain units and conservative max(estimate, net charges) until trusted final settlement. Unknown dispatch retains holds and cannot be automatically cancelled/retried. Charges/refunds have globally issuer-account-event uniqueness; account namespace comes from trusted registry, not request JSON. Refund FK binds org/site/reservation/currency/original month; lock original charge and cumulative credits. Verified refunds cannot exceed the referenced debit and never restore units. A refund after final settlement may reduce net cost; new charges after settlement are refused for incident review. Overrun persists the charge and global pause together; credit never auto-unpauses.

Source domain reservations begin at version **0**; candidate SQL preserves that. Creation journal is reserve 0→0, later events increment by one. Terminal completed/failed states permit verified financial events, including late credits, without restarting execution. Append-only events/postings plus identity/counter guards are proposed. SQL alone cannot prove aggregate credit limits, last-slot/currency/rules consistency or settlement authenticity: a durable adapter spanning budget lock/CAS/journals/pause is still required.

012 deliberately supports generation before a content record exists (nullable content_id); publication requires a scoped content record. It bounds opaque IDs to 128 characters, while the source domain accepts some 200-character event/request keys. The future adapter must explicitly refuse overlength input before transactions, or obtain a separately reviewed schema extension—never truncate/hash silently. The source `Scope` lacks publication destination/version and operation; an explicit versioned extension is required. Service events identify service separately from nullable user actor and retain policy/auth revision and <=5-minute authorization timestamps. Provider postings retain key revision and verification time. These are proposed service contracts, not an installed adapter.

## Independent monotonic anchor options

Primary documentation checked 2026-10-20:
- https://etcd.io/docs/v3.5/op-guide/recovery/ — snapshot recovery can move history backward; revision bumps address revision ordering, not recovery of missing revoked values.
- https://etcd.io/docs/v3.5/learning/api/ — leases expire without keepalive; lease-attached keys are deleted. Never attach durable revocation/checkpoint records to expiring lock leases.
- https://tpm2-tools.readthedocs.io/en/stable/man/tpm2_nvincrement.1/ — hardware NV counter increment primitive. A counter alone is not a signed hash journal or distributed lock.

The following are engineering assessments, not certified implementations or vendor price quotes.

| Option | Durability / rollback boundary | Leases, crash and keys | Cost / decision |
| --- | --- | --- | --- |
| Existing separately administered three-node etcd witness | Quorum/WAL can survive a failed node; it must be outside SQL backup/admin rollback domain. Restoring all witness nodes from an old snapshot loses revocations; revision bump does not recreate them. | mTLS, separate ACLs, CAS, persistent checkpoint keys and separate leased lock keys. Loss of lease/partition must fence or abort SQL before another holder proceeds. Full-witness loss requires independent last checkpoint/revocation records or permanent HOLD/key retirement. | No new service bill only if suitable independently managed hardware already exists; power, disks and operator time remain costs. No cluster provisioned. Not sufficient alone against its own rollback. |
| Existing physical TPM NV counter + independent append-only signed journal | Counter can detect older journal epochs while hardware/authorization policy remains intact. Bind each durable journal root to counter epoch; unavailable/mismatched root fails closed. Hardware replacement/clear is a new trust root requiring explicit retirement/reapproval. | Single owner daemon serializes all processes; append/fsync intent, advance counter, fsync final record before acknowledgment. Crashes with unresolved epoch HOLD, not counter reset. Separate protected signing key and platform hierarchy custody; NV write endurance/capacity must be assessed. | Potential zero new purchase if an actual protected TPM exists; ordinary vTPM/VM snapshot may share rollback domain. Hardware and recovery tests unavailable. Cannot claim rollback resistance from a software emulator. |
| Independent offline custody witness | Signed external checkpoint/revocation high-water marks can detect stale recovery, provided the custody record itself cannot be silently replaced. | Human recovery gate; no always-online lease/claim authority. Two-person custody, durable append-only media, independently verified last sequence and retired-key register. | Uses existing resources/operator time, no automatic online guarantees. Suitable as release HOLD/recovery witness, not a production authorization backend. |
| Same MariaDB table / local file / second schema / same-host snapshot | Shares rollback or admin domain. fsync, HMAC and a hash chain establish integrity only relative to a trusted latest root. | File locks are not distributed fencing; signed old state is still old. | Rejected as an independent anchor. |

Safest zero-additional-resource decision now: **remain fail-closed with no production anchor backend**. Select and independently certify a real witness + custody/rollback threat model before integrating. Paid managed witnesses were not provisioned or priced as a presumed free solution.

### Required anchor semantics

Persist generation, revocation tombstone, sequence/root and pending intent outside the SQL archive. Revoke at the independent anchor first; SQL/audit failure cannot undo it. Recovery never lowers a counter, clears pending or revocation, refreshes expiry, creates a new key under an old ID, or rewrites issuer history. Lost/pending commits reconcile only the exact signed still-valid envelope; expired pending evidence needs an operator incident decision and remains HOLD.

A lease TTL is not enough: a paused former holder can resume after another process acquired the lease. A checkpoint before SQL commit cannot by itself rule out lease loss immediately afterward. Require a certified fencing/commit protocol or fail-stop coordinator that prevents lease handoff until old SQL transactions are confirmed aborted; a fence in the same rollbackable SQL table is not an independent anchor. Lock ordering alone does not solve distributed atomicity. Test lost keepalive, process suspension, partition, unknown SQL commit and anchor restart across processes before acceptance.

## Unified recovery v2 contract

`unified-recovery-v2.cjs` authenticates bounded canonical UTF-8 JSON (32 MiB, 100k total rows), not native SQL dumps. Exact envelope fields reject executable SQL/DDL/session/client-directive fields; SQL-looking literal cell data remains inert. HMAC is separate from content SHA-256, with independently supplied 32-byte key. Columns/order, declared unique/FK tuples, twelve ledger hashes, per-table counts/sorted content hashes and JSON scope mirrors are checked. Complete independent MariaDB metadata must be captured from a separately installed clean reference; the review validator binds its hash but **does not collect or independently certify that metadata**. No source-provided schema/DDL is executable. Source/destination must be distinct growthos_test_* identities; this lexical review is not proof of an empty connected destination.

The library explicitly returns restoreExecutable=false and exports no restore executor. Matching supplied trust snapshots returns publicationAuthorized=false and requires a live independently authenticated lease; passing arbitrary arrays does not prove independent anchor state. Unsigned/unverified trustCheckpoints never become authority. Additional signature/chain completeness, legacy incident scope, financial balance, policy history and live metadata checks remain required before a full archive validator can accept operational data. Current positive fixture is ledger-populated with other tables empty, not a populated application backup.

Future restoration must prevalidate everything, acquire owned destination lock, independently verify empty identity/session/FK/CHECK settings and install only pinned DDL. Insert immutable journals without disabling triggers. Restore terminal claims through unknown→terminal; insert authorizations unused, then monotonic consumed/revoked transitions before uses. Quota histories must replay reserve/version-zero→start/terminal/settlement/credits without modifying immutable rows; preserve original timestamps and holds. This requires a separately reviewed cross-table restoration order and replay executor. Final metadata/count/hash comparisons and FK/immutability checks must precede any restore success. Partial DDL/data interruption leaves a nonempty failed destination; never retry/reset it. Recover in a new independently verified empty disposable schema.

Keep application/workers offline, switches disabled and keys quarantined after restore. Reconcile EVERY historical issuer/key against independent current generations/tombstones/pending/root; extra, missing, revoked or rolled-back keys remain HOLD. Exact snapshot equality is necessary but not sufficient: current signatures, registry capabilities, expiry, sessions, policy, destination and quota/budget need fresh verification. No archive liveness flag authorizes publication.

## Principal separation / grants specification

Different actual database accounts/pools are mandatory; capability strings alone are not grants. No grants were executed.

| Principal | Allowed writes | Denied |
| --- | --- | --- |
| Authorization issuer | INSERT content_authorizations and authorization_events; UPDATE only revoked_at | Claims/uses/consumed_at, connector trust/evidence, quotas/spend, enablement, DDL/DELETE |
| Connector writer | INSERT evidence_history and attestations; pointer event/sequence/hash/signed_json updates; legacy denial projection | Issuer/key generation provisioning, authorizations/claims/quota/policy enablement, DDL/DELETE |
| Claim consumer | Existing content/event/claim/observation transaction; consumed_at/claim_hash; INSERT authorization_uses | Issuance/revocation, connector evidence, policy/activation, arbitrary financial postings |
| Quota execution coordinator | INSERT reservation/events; restricted CAS state/version/start/counters in reviewed unified transaction | Financial evidence creation, journal UPDATE/DELETE, DDL or feature enablement |
| Financial reconciler | INSERT signed postings/events; CAS charged/refunded/settled totals and pause-only control | Publishing, unpause, authorization issuance, evidence/key provisioning, journal mutation |
| Trust administrator | Independently authorized anchor first, then monotonic issuer projection/revocation audit | Runtime claims, unrevocation, resetting anchor/SQL history |
| Installer / restore administrator | Approved DDL only in independently owned disposable database | Use as application account or grant wildcard installer rights to runtime |

Runtime readers may need FOR UPDATE on SELECT-only tables; exact MariaDB privilege behavior and column grant sufficiency must be tested rather than solved by GRANT ALL. No DELETE/ALTER/DROP/TRIGGER/GRANT OPTION for runtime principals. Database grants do not supply row-level tenant authorization; every adapter query must retain org/site predicates. The prepared worker currently tests a read-only principal's write refusals, not this complete column-grant matrix.

## Safest next sequence

1. Independently approve/revise 012 bounds, publication scope extension, funding identity and wide-aggregate transaction design; preserve existing 010/011 pins. Update a new review version if any frozen contract changes.
2. Implement durable quota/financial adapter and atomically integrate funding start with authorization/claim/content mutation; missing execution guard remains deny.
3. Select and certify independent anchor custody, fencing and crash/recovery protocol. Certify actual issuer/writer/consumer/accounting grants.
4. In an authorized free local environment with Node 22 and preloaded digest-pinned MariaDB 11.8, run prepared SQL probes. Complete application races, deadlocks, signed settlement, anchor two-process failures and full privilege tests; the existing worker deliberately exits 2 until broader gates are complete.
5. Implement a separately reviewed unified restore executor, populated synthetic fixtures and genuine round trip/corruption/interruption/retry/session-safeguard drills. Do not reuse v1 success as evidence for 31 tables.
6. Execute Node 22 parity and isolated authenticated staging. All independent gates plus explicit release approval are required. No production action is authorized here.
