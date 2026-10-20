# Durable publication application integration — 20 October 2026

**Production HOLD / NO-GO.** Isolated branch `feat/growthos-publication-durable-completion-20261020` starts at `78f0360f48e6fc2bdf3dc814da29a98726cf06a3`. Candidate migrations 010–014, certified recovery, migration runner, routes and provider settings remain unchanged. No database was accessed and no worker, live publisher or provider was called.

## Implemented boundaries

| Contract | Code and transaction behavior | Activation boundary |
| --- | --- | --- |
| Factory schedule | `MySQLContentFactoryStore` now requires a `schedule` callback on scheduling; it runs after the canonical content CAS but before the same COMMIT. Missing callback rolls back. `MySQLPublicationJobScheduler` checks the persisted factory envelope and approved digest, obtains a current authorized destination, inserts one scheduled job and rechecks authority on the **supplied** connection. | No default destination/approver/site-policy authority; no route constructs it. The scheduled job is inert. |
| Approval identity | Issuance and claim verification decode `_factory` envelopes before comparing the approved event and version-bound `contentAuthorizationHash`. The SQL participant uses the canonical record and keeps the approved digest. | Connector checkpoint, current approver/session, budget and independent fence are still mandatory injections. |
| Claim content transition | `writeFactoryPublicationTransition` preserves the factory metadata and append-only journal during `publication_unknown` and trusted confirmation using the same content-event CAS connection. Existing atomic repository retains unique claim, distinct v2 funding, authorization use, binding, job and audit in one transaction; it never opens a nested transaction for factory content. | No default schema/budget/fencing authority. A real COMMIT ambiguity enters operator HOLD. |
| Revision and cancellation | Existing `MySQLPublicationRevisionInvalidator` remains the factory's explicit same-connection callback. Claimed/ambiguous work refuses; scheduled jobs, unused authorization and uncharged funding are cancelled and journaled in the factory revision transaction. Missing callback denies revision/cancellation. | Required actor and quota release authorities remain absent by default. |
| Status and retry | `MySQLPublicationStatusOperations` accepts only a caller-supplied SQL connection. It locks scoped content, job, claim, funding binding, quota reservation and consumed authorization; verifies current authority and signed destination-bound observation. Unknown outcomes record an immutable observation/event and schedule only a bounded status probe. Trusted probe failure increments a maximum-five retry counter; terminal status never dispatches again. Confirmation writes claim, content, job and audit together. Duplicate issuer/event identities refuse. | It requires candidate 014 and a **real** current signature/issuer revocation, independent fence, policy, session and funding authority. No implementation of those authorities is supplied. No `PublicationJobStore.transaction` or provider dispatcher is wired. |

The existing `SafePublicationWorkflow` claim path still needs a certified durable `PublicationJobStore.transaction` that shares the exact atomic repository transaction and independently held fencing lease. Calling the repository from inside another store transaction would create nested transactions, so that adapter remains deliberately unavailable. Likewise the status methods are transaction participants, not independently committing services. The caller must hold the single transaction through the final recheck and COMMIT, and unknown COMMIT must be read back without any dispatch retry.

## Executed evidence

Runtime: Node **v24.19.0**; Node 22 and isolated MariaDB 11.8 were unavailable. `node_modules` had been installed previously by `npm ci --ignore-scripts --no-audit --no-fund` on the source checkout. The following ran sequentially after implementation:

| Command | Exit | Result |
| --- | ---: | --- |
| `npm test` | 0 | 458 discovered; **457 pass, 1 skip, 0 fail** |
| `npm run typecheck` | 0 | PASS |
| `NEXT_TELEMETRY_DISABLED=1 npm run build` | 0 | PASS |
| `npm run test:security:offline` | 0 | PASS |
| `npm run test:mutation-security:offline` | 0 | PASS, 52 assertions |
| `npm run test:db-guards:offline` | 0 | PASS, 8 refusals |
| `node scripts/verify-production-migration-package.cjs` | 0 | PASS, offline baseline only |
| `node --import=tsx --test src/core/__tests__/mysql-publication-job-scheduler.test.ts src/core/__tests__/mysql-publication-status-operations.test.ts` | 0 | PASS, 8 synthetic cases after final authority recheck |
| `npm run typecheck`; `NEXT_TELEMETRY_DISABLED=1 npm run build` | 0 each | PASS after final authority recheck |

The added cases cover stale approval/version, cross-tenant scheduling, invalid destination, revoked authority, missing schedule callback rollback, immutable factory approval journal, bounded status retries, forged observation scope, replay and terminal status refusal. Existing atomic tests cover mocked duplicate claims, double funding prevention, rollback and indeterminate COMMIT. These are simulated SQL interactions; **live MariaDB locking, FK/CHECK/trigger compatibility, real two-session contention, least-privilege grants and populated recovery remain BLOCKED**, not PASS.

## Remaining release dependencies

Independent current trust anchor and lease custody; signed destination-aware issuer registry and revocation verifier; schema-pinned 010–014 disposable MariaDB certification; actual quota-v2 budget/settlement authority; current schedule/approver authority; direct same-transaction `PublicationJobStore` claim composition; status transaction wrapper with an independent lease through COMMIT; restore and interrupted-transaction certification; authenticated isolated staging. The existing candidate 014 remains review-only, no migration was installed, and publication/automation remain disabled.
