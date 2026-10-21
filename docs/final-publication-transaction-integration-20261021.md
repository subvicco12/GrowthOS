# Final publication transaction integration — 21 October 2026

**Production HOLD / NO-GO.** Branch `integration/growthos-final-publication-20261021` starts at durable source `a40bfe6d42106d4b824a4c54633dac01c2c45a51`. Certification reference `ae534f637c17886b4513dc935db99969561787d1` is read-only; common ancestor `78f0360f48e6fc2bdf3dc814da29a98726cf06a3`. No migration, recovery package, route, provider or worker was changed. This code is not wired for production use.

## Integrated boundary

`SafePublicationWorkflow` accepts an optional atomic claim hook. Its deterministic claim event identity matches the SQL participant's `claim_<SHA-256(idempotencyKey)>`. The hook returns the job persisted by the participant. The workflow checks scope, version, hash, destination, claim and journal and does not issue a second save. Legacy synthetic store behavior is unchanged.

`MySQLPublicationJobStore` obtains an independent fence before SQL locks, obtains one caller-controlled connection, verifies participant compatibility and independently pinned 014 metadata, then begins one transaction. The existing SQL participant operates on that same connection in the sequence: scope/content lock, authorization and publication funding checks, unique claim, quota-v2 start, authorization consumption, immutable funding binding, content unknown transition, audit append, job journal/CAS, and commit-boundary checks. The store rechecks current session, membership, policy, connector/key revocation, budget and destination through a mandatory external authority interface, plus the independent fence, before COMMIT. It supplies no default authority, pool, installer, provider or scheduling loop. Missing authority denies construction; unsupported cancellation/status methods refuse before commit. The separate status operations and revision invalidator remain supplied-connection components, not an operational workflow adapter.

For status probes and signed observation reconciliation, the store delegates to the existing `MySQLPublicationStatusOperations` on the same supplied connection, then reads the persisted job and rechecks authority and fence before COMMIT. Its current, failed-probe, signed-observation and revocation authorities must be injected; absence refuses the request. Cancellation remains disabled in this adapter because the revision invalidator requires the content factory's locked revision transaction.

Unknown COMMIT returns an operator HOLD after exact-identity readback, even if readback says absent or committed; there is no automatic retry. Precommit errors attempt rollback; uncertain rollback also fails closed. The schema pin, trust verifier, fencer, reservation/budget authority, session authority and candidate installation require independent implementation and certification. A mocked `CertifiedAtomicParticipants` capability is not proof of MariaDB behavior or production authority.

## Recovery and schema compatibility

Candidate 010–014 SHA-256 values remain respectively `bb10b32ec0186399ae10b1820541d4330aab500843cd0fcf2a82b4da515c2c5b`, `7b9f5b15d2797c13bc6c30d04a08d49b5112a2545f264b543e86ffd5b303362a`, `6d32ff6a950e9e90c40a4c5e5892c783914847c0f518faab980f08764bc310a6`, `049f16c9c9eb9336c60b9d3ebf42d5f66763257146d4d99714b0f74e7aea481e`, `d341bb3bc004b332f7cbc8253c2e5eb5255a4b8120860ae5d453f87762ee71b8`. The static verifier reports candidate 014 review-only/uninstalled with three statements, two new FKs and 14 FK columns. Certified 001–009 package verification passed; no SQL was installed. The certification branch recovery-v4 is a non-executable authenticated archive contract for the *proposed* 34-table, 42-trigger, 169-FK-column and 14-ledger inventory. It has not been merged, installed or used as a restore executor. Its metadata pin and cross-table semantic reconciliation, independent trust anchor, populated backup and two-session MariaDB behavior need independent live review. The job adapter requires exact 014 metadata pinning before any transaction and cannot silently accept 013-only schema.

## Executed commands (Node v24.19.0)

| Command | Exit | Actual result |
| --- | ---: | --- |
| `node --import tsx --test src/core/__tests__/mysql-publication-job-store.test.ts` | 0 | 6 mocked tests passed; no database |
| `npm test` | 0 | 464 discovered, 463 passed, one skipped |
| `npm run typecheck` | 0 | TypeScript passed after fixes; initial invocations exited 2 while implementation was in progress |
| `npm run build` | 1 | Compilation and static generation succeeded; Next export failed `ENOTEMPTY` removing `.next/export` |
| `NEXT_TELEMETRY_DISABLED=1 npm run build` | 1 | Clean generated-cache retry failed with the same `ENOTEMPTY` |
| `npm run test:security:offline` | 0 | Offline source checks passed |
| `npm run test:mutation-security:offline` | 0 | 52 offline assertions passed |
| `npm run test:db-guards:offline` | 0 | Eight guard refusals passed |
| `node scripts/verify-production-migration-package.cjs` | 0 | Certified 001–009 offline package contract passed; no installation |
| `node scripts/verify-publication-observation-scope-candidate.cjs --candidate-010=/tmp/growthos-final-010.sql --candidate-012=/tmp/growthos-final-012.sql` | 0 | Review-only 014 static pins passed; dependencies extracted read-only from their exact source branches |
| `sha256sum /tmp/growthos-final-010.sql /tmp/growthos-final-012.sql database/proposals/011_authorization_trust_candidate.sql database/proposals/publication-funding-v1/013_publication_funding_jobs_candidate.sql database/proposals/publication-observation-scope-v1/014_observation_scope_candidate.sql` | 0 | Five expected SHA-256 values above |

The `npx tsx --test ...` invocation exited 1 because this runtime denied tsx's `/tmp/tsx-0/18.pipe` IPC listen; `node --import tsx --test ...` passed without that CLI. Build's repeated `ENOTEMPTY` is an unresolved local runtime failure. A clean Node 22 build is required.

## Remaining release gates

- Node 22 and isolated disposable MariaDB 11.8 were unavailable (`node` v24.19.0; no `node22`, `docker`, `mariadbd` or `mariadb`). Two-session contention, rollback/unknown COMMIT, least-privilege grants, candidate 010–014 installation, full metadata, populated backup/restore and recovery-v4 negative cases are **BLOCKED**, not passed.
- Authenticated session/authorization issuer, independent fencing and monotonic trust, connector signature/revocation, quota-v2 budget authority and exact schema metadata pin must be supplied and independently certified. The injected interface cannot be treated as production authority merely because it has the expected capability tag.
- Status reconciliation and bounded retry now delegate to supplied-connection operations under the same workflow transaction, with mocked checks only. The actual signed observation and revocation authorities remain unavailable. Cancellation deliberately refuses in this adapter; revision invalidation remains a separate supplied-connection callback owned by the content factory revision transaction and requires integration certification.
- Independent review of candidate migrations and recovery-v4, live MariaDB certification, reproducible Node 22 build, staging, security and explicit release approval remain mandatory. No provider dispatch or publishing is enabled.
