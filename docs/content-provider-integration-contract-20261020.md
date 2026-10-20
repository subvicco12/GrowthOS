# Content factory / safe publication integration contract v1

**Production HOLD / NO-GO. No provider, route, queue, scheduler or worker is activated.**

## Authority and baseline

Read-only source: `feat/growthos-authorization-trust-20261019` at `8b0e2d9eb52eb184eb9ecc5ba5b2521eb0acf71d`. This branch is independently derived from that commit, not a merge of schema/quota/certification branches. The uploaded GrowthOS Complete Master Blueprint & Architecture Bible (SHA-256 `1a04e0a2afae7545740948aeaadb876c0f972f5ae7720128ec2b662354ce8a92`) sections 13, 29–30, 37–43 and 49–51 require verifiable research, human review, rights, channel quotas, safe scheduling and reconciled unknown outcomes. Existing content lifecycle/ContentStore, publication handoff, claim store, approval issuance, connector trust, signed observation verifier, job runner and tests were inspected. Existing integration and authorization/trust evidence remain authoritative for their scopes.

## Workflow inventory and implementation

| Workflow | Existing source | This branch | Certification limit |
| --- | --- | --- | --- |
| Research | HTTPS URL/claim/time checks in content-lifecycle.ts | Strict source receipt, snapshot hash, verification ID, freshness and mandatory trusted source verification | No live source retrieval; trusted verifier must actually verify snapshot/provenance and current revocation |
| Brief | Missing | Topic/audience/objective/language/disclosures and explicit rights asset inventory | Local preparation only |
| Draft | Text input and lifecycle state | Requires verified research + brief; bounded plain text | No LLM or paid generation; manual/synthetic input only |
| Originality | Boolean quality field | Bounded seven-token local corpus advisory plus verified issuer report/corpus/report hashes | No claim of global plagiarism detection; advisory can never grant quality |
| Revision | Missing | New content version, immutable command journal; clears quality/approval/schedule and invalidates linked unclaimed work | Durable adapter must atomically invalidate pending jobs/auth and release only unstarted funding; claimed/ambiguous work refuses |
| Quality | Boolean factual/original/rights/disclosure/YMYL checks | Exact source claim coverage, trusted report bound to reviewed hash, per-asset publication rights/provenance/attribution, policy-derived disclosures and regulated-review requirement | Qualification/signature/license validity require trusted verifier; caller booleans never suffice |
| Human approval | Existing approve event and separate publication authorization | Owner/admin explicit consent binds reviewed hash and quality report; current original approver checked again for scheduling | Factory approval is NOT publication authorization |
| Schedule | Existing schedule timestamp/channel | Local approved schedule + version-bound job intent, no timer or outbound work | Durable job store absent; no queue activation |
| Provider/channel | Existing synthetic status probe | Disabled extensible channel interface and synthetic WordPress draft renderer/status signer; .invalid endpoint only | No HTTP client, credentials, WordPress REST call, upload or publish method |
| Claim/funding | Existing atomic claim/content/auth consume; mandatory execution guard | Separate atomic funded/fenced job transaction contract; missing adapter denies | Existing claimOnce cannot be called in a second transaction to pretend atomicity with jobs/quota-v2 |
| Reconciliation | Existing signed claim-scoped observation + atomic SQL reconcile | Destination-bound synthetic envelope, immutable observation replay requirement and job/content/claim atomic reconciliation contract | Real destination-aware provider issuer and durable adapter unimplemented |
| Failure/retry | Generic JobRunner may retry handlers | Publication workflow retries read-only probes only with bounded backoff; unknown retains unique claim; fifth probe failure/unknown enters operator_review | No dispatch handler registered with generic JobRunner |
| Cancellation | Lifecycle denies post-claim cancellation | Before claim only; linked schedule/unstarted funding cancellation must share transaction | Claimed/absent/unknown/confirmed/operator-review states cannot be reset into retry |

New source files:
- `src/core/content-factory.ts`
- `src/core/content-originality.ts`
- `src/core/safe-publication-jobs.ts`
- `src/server/synthetic-wordpress-provider.ts`

No existing application module is modified. All source changes are new contracts/components; existing security and persistence code remains byte-identical.

## Content factory transaction contract

`FactoryStore.transaction(scope, work)` must provide a real tenant-scoped transaction, content CAS, durable unique event identity and atomic journal/metadata/record writes. `UnavailableFactoryStore` always throws `DURABLE_CONTENT_FACTORY_ADAPTER_REQUIRED`. No in-memory fallback is used by production. Synthetic stores exist only inside tests.

The caller is an authenticated server service: derive `{sessionHash,organizationId}` from the actual server session, never browser JSON. `authenticate` re-reads session/user/current membership/website, permitted role, regulated-content policy and required disclosures, returning at most five minutes of authority bounded by session expiry. `recheck` must re-read session/membership/policy at the commit boundary and reject changed policy/roles. It is not an injected always-allow boolean. There is no new HTTP route; any future route must reuse existing canonical Host/Origin, bounded JSON and secure-cookie controls.

Each command binds expected content version/event identity. Replay refuses; compare-and-swap rejects concurrent updates. Every event records canonical command SHA-256, server actor, operation, timestamp and resulting version. Evidence and context are snapshotted before asynchronous work. Evidence freshness and principal deadlines are checked again at the commit boundary. Source verification binds org/site/content, server-regulated classification and reviewed hash; QA verification must authenticate report issuer, expiry/revocation, covered corpus/report/proofs and reviewer qualification. HTTPS and a hash alone are not proof that a fact/license is valid.

Factory review hash binds organization, site, content ID/type, brief (including assets/disclosures), verified research receipts and draft. Quality and human consent refer to that exact hash. Reports cannot be reused after revision. Approval is current owner/admin human consent; editors can prepare material but cannot provide this consent. Scheduling revalidates report/source freshness and current original approver membership. A separate publication authorization still binds the final scheduled **full** record/version/destination/policy through the existing independent bridge; no factory review hash substitutes for it.

`invalidateUnclaimedWork` is mandatory on revision/cancel. It must lock related unclaimed job/auth/funding records in the reviewed order, deny any claimed/ambiguous work, invalidate old local intents and release only unstarted holds in the SAME transaction. An unavailable release/invalidation adapter refuses the revision, rather than leaving a new draft with live old jobs. No quota settlement code is changed.

## Precise persistence dependencies — no replacement tables

No migrations or database proposal files are created/changed here. The source branch does not contain a durable scheduling/job backend. Its existing `ContentStore.update` accepts only the older `ContentEvent` union and validates transitions by replaying that exact union. It cannot persist this factory envelope or brief/revision event merely by casting types.

Before production wiring, persistence owners must approve:

1. Backward-compatible serialization of `FactoryEnvelope` metadata (brief/research/QA/human consent) with `ContentRecord`. An optional reviewed JSON extension inside the existing candidate-010 record_json may be possible, but is **not implemented or assumed compatible**. Preserve all root record scope/version/stage mirrors and full-record authorization hashes.
2. Explicit brief/revision command/event support in the authenticated durable store, with atomic content row + append-only content event + metadata writes, CAS and unique request identity. Existing `MySQLContentStore` must not be bypassed with arbitrary apply callbacks or fabricated ContentMutationEvidence.
3. Persistence of versioned `PublicationJob` identity/destination/retry journal with immutable scope, original content version/hash, monotonic CAS and globally scoped one-time claim identity. No table name or migration number is invented here. Schema owners choose/review the storage representation separately.
4. A real session/membership/policy/source/QA issuer verifier. No source URL is fetched here. Future retrieval needs bounded, SSRF-safe public-origin handling, redirect/DNS controls and snapshot digest verification; this component supplies no network authority.
5. A unified transaction adapter consuming existing publication approval/authorization, independent connector trust/fencing and **separate quota-v2 publication funding** with job + claim + content + audit writes. Missing any dependency must fail before accepting the intent. A completed generation reservation is not publication funding.
6. Restore/recovery compatibility for metadata/journals and job states under the independent schema/recovery review. No existing recovery package is broadened.

No adapter in this branch opens MariaDB, uses production configuration or installs schema. The two default stores fail closed immediately. Production services/routes are not wired to synthetic stores.

## Publication job invariants

A local scheduled job binds org/site/content, exact scheduled content version/full hash, channel, canonical destination ID/revision/HTTPS target and due time. `claimContentAndFunding` must re-read current owner/admin session/memberships, original approver, source approval/version/destination, all feature/global/site/automation/publishing switches, signed current connector evidence, revocation/fencing and quota/budget/provider ceiling at the authorization boundary. A stale content record or changed destination cannot be accepted on the strength of job JSON.

`PublicationJobStore.transaction` must own the existing independently certified lease/fencing boundary before SQL locks and through commit; this branch does not change or implement independent anchor design. Claim consumption, funding start, claim insert, content publication_unknown, authorization-use evidence and job journal must be one transaction. The old public `claimOnce()` commits internally, so composing it with a separate job transaction is prohibited. Unknown commit outcome requires durable readback by the same unique identity. No token, session digest or server-only authorization object may be stored/returned in a public job claim; the new runtime job schema rejects such fields.

There is **no dispatch action**. Claiming creates a local ambiguous intent, not a successful external publication. The synthetic WordPress adapter only prepares escaped draft payloads and returns test observations; it has no publish method or network capability. Scheduling changes no enablement flag.

After a claim, cancellation and new claim attempts refuse. Provider failure/unknown never becomes absent or permits another provider attempt. Probe delays are 1, 2, 4, 8 seconds, then operator review on attempt five; the capped retry function supports a 5-minute maximum without an active timer. A caller must explicitly invoke a permitted probe command after nextProbeAt, and all fresh authorization remains required. Terminal absent preserves content publication_unknown and permanently retains its one-time claim. Manual recovery cannot simply clear the claim/job.

`reconcileContentAndClaim` must verify the independently trusted provider issuer's signature, event replay, scope, immutable authorization/destination, current key revocation and freshness INSIDE the transaction; job update and existing atomic claim/content/observation reconciliation share that transaction. It must reject contradictions, not overwrite terminal provider evidence. Existing `MySQLPublicationClaimStore.reconcile` owns its own transaction, so it is a reference contract, not a drop-in transaction participant. No duplicated SQL implementation is invented here.

## Synthetic WordPress evidence

The fixture adapter requires an explicit 32-byte synthetic key, issuer prefix synthetic_ and an HTTPS `.invalid` target. It loads no environment credentials. Draft text/title is bounded and escaped; status remains draft, with no WordPress network request. A fixed-tuple outer HMAC additionally binds destination ID/revision/target and the existing signed claim observation. The existing provider-evidence verifier checks org/site/content/channel/reservation/claim hash/expiry/issuer signature, while the outer fixture verifier checks destination and current registry revocation. Published fixture URLs must match the configured destination origin. The adapter never discovers credentials, endpoints or capabilities from ordinary connector configuration.

Fixture observation IDs are deterministic per job/version/time/outcome. A durable replay journal must reject repeated/rebound issuer events. Key material remains outside records/journals/reports. These signatures attest **synthetic fixture behavior only**; they do not establish real WordPress connectivity, provider status or trusted operational evidence.

## Required gates before any integration

Reviewed durable factory serialization/transaction adapter; real trusted source/QA provenance; unified job/claim/authorization/funding transaction; independently supplied fencing/connector backend; revocation-aware signed provider status issuer with destination binding; grant/recovery review; actual Node22/MariaDB concurrency and authenticated isolated staging. Keep publisher/worker/provider integrations disabled until all independent gates and explicit approval. No release or publishing permission follows from these unit tests.
