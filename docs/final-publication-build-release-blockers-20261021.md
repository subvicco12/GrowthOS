# GrowthOS final publication build and release blockers

**21 October 2026 · Production HOLD / NO-GO.** This report continues `integration/growthos-final-publication-20261021` from GitHub commit `427e8775a1c12799493c7ef67f9974dc4367c6ad`. The durable-completion source is `a40bfe6d42106d4b824a4c54633dac01c2c45a51`; the integration branch preserves that ancestry. The independent certification reference `ae534f637c17886b4513dc935db99969561787d1` was read only. Changes on this branch since the source are confined to the publication job store, workflow, mocked tests and evidence. No migration, recovery safeguard, route, publisher, worker or production setting changed.

## Build diagnosis

The repository has no `next.config.*`. Its `build` script is `next build` with Next.js 15.5.24. The earlier Node 24 builds compiled and generated all static pages, then failed while Next removed `.next/export` with `ENOTEMPTY`. The workspace uses overlayfs with more than 30 GB available. Moving the generated `.next` directory aside did not resolve the original failure. Next's default build worker count derives from the reported CPU count; this environment reports nine CPUs. A **clean** build with `CIRCLE_NODE_TOTAL=2` (one Next build worker), `NEXT_TELEMETRY_DISABLED=1` and no source/config change exited 0. A second capped build after the transaction fix also exited 0. This is strong evidence of a worker/temporary-export cleanup interaction in this runtime, though no filesystem event trace proves the precise race. It is not appropriate to mark the original uncapped command PASS or to silently hide the workaround. Node 22 parity is still unexecuted; the available Node is v24.19.0.

## Independent transaction review and fix

The workflow uses the existing participant on one caller-owned `PoolConnection`; no nested transaction or store-owned second transaction was found. SQL claim, distinct publication funding start, authorization consumption, content transition, immutable job/audit writes and pre-COMMIT authority/fence rechecks are in the same transaction. The status participant also receives that connection and verifies scoped signed observations; ambiguous provider outcomes remain pending/operator review rather than being dispatched again. The unique claim and CAS guards remain in the candidate SQL and are **not** live-certified.

A confirmed recovery defect existed in `MySQLPublicationJobStore`: after an uncertain COMMIT, it invoked `readCommittedIdentity` while still holding the transaction connection. A pool with one available connection could block readback. Connection release or fence-release errors could also replace an operator-HOLD error or obscure a successful COMMIT as a generic cleanup error. The fix releases the uncertain connection before bounded diagnostic readback (5 seconds maximum); every uncertain result remains operator HOLD. Cleanup failure after a known COMMIT now reports `PUBLICATION_POST_COMMIT_CLEANUP_OPERATOR_HOLD`. Pre-COMMIT failure still attempts rollback. Two mocked regressions verify release-before-readback and post-COMMIT cleanup behavior. These tests do not certify real pool behavior, SQL atomicity or a real independent fence.

The cancellation operation in this job adapter still refuses. The revision invalidator must run in the content factory's transaction after its scoped content row is locked, and refuses claimed or ambiguous work. Wiring it through the job store would create an unsafe second transaction or invert the reviewed lock order. That integration needs independent authority and live SQL review; no bypass was added.

## Executed checks and exact results

| Command | Exit | Result |
| --- | ---: | --- |
| `node -v` | 0 | `v24.19.0`; Node 22 unavailable |
| `CIRCLE_NODE_TOTAL=2 NEXT_TELEMETRY_DISABLED=1 npm run build` after moving `.next` aside | 0 | Clean Node 24 production build |
| `npm test` | 0 | 468 discovered, 467 passed, one skipped, zero failed; mocks/offline |
| `npm run typecheck` | 0 | PASS |
| `CIRCLE_NODE_TOTAL=2 NEXT_TELEMETRY_DISABLED=1 npm run build` after code fix | 0 | Node 24 production build PASS |
| `npm run test:security:offline` | 0 | PASS, no DB/network |
| `npm run test:mutation-security:offline` | 0 | 52 offline security assertions PASS |
| `npm run test:db-guards:offline` | 0 | Eight refusal cases PASS |
| `npm run test:auth-cookies:offline` | 0 | Five route regression checks PASS |
| `node scripts/verify-production-migration-package.cjs` | 0 | Offline 001–009 contract PASS, no installation |
| `node scripts/verify-publication-observation-scope-candidate.cjs --candidate-010=/tmp/growthos-final-010.sql --candidate-012=/tmp/growthos-final-012.sql` | 2 | Initial input-path refusal: temporary 010 file absent; no SQL |
| `sha256sum /tmp/growthos-release-010.sql /tmp/growthos-release-012.sql` | 0 | Exact pinned 010 and 012 hashes confirmed after read-only extraction |
| `node scripts/verify-publication-observation-scope-candidate.cjs --candidate-010=/tmp/growthos-release-010.sql --candidate-012=/tmp/growthos-release-012.sql` | 0 | Review-only candidate 014 PASS, uninstalled |
| `node scripts/verify-publication-funding-proposal.cjs --candidate-010=/tmp/growthos-release-010.sql --candidate-012=/tmp/growthos-release-012.sql` | 0 | Review-only candidate 013 PASS, uninstalled |

Previous uncapped `npm run build` and the uncapped clean-cache retry both exited 1 with `ENOTEMPTY` at `.next/export`; they remain recorded as FAIL in `docs/final-publication-transaction-integration-20261021.md`. The capped build is a separate PASS condition, not a retroactive change to those results.

## Outstanding independent gates

- No `node22`, `mariadbd`, `mariadb`, `mysqld`, `mysql`, `docker`, `podman` or `nerdctl` executable is available. Disposable MariaDB 11.8 isolation and synthetic-only credentials cannot be verified; no DB command, migration, two-session contention, grant test or populated backup/restore was run. **BLOCKED.**
- Run a clean Node 22 build, tests and security suite in an isolated environment. Confirm whether the worker cap is required there and investigate uncapped `ENOTEMPTY` if reproducible. **BLOCKED.**
- Independently review and install candidates 010–014 only in a verified disposable schema. Certify real transaction rollback, unknown COMMIT, unique claim, revocation races, scope, least privilege and recovery-v4 with populated synthetic archives. **BLOCKED.**
- Supply and certify server session, current membership and approver, independent monotonic fence, connector issuer/revocation and destination evidence, exact 014 metadata pin, quota-v2 and budget authorities. Capability tags and mocked participants are insufficient. **BLOCKED.**
- Complete safe cancellation wiring in the content factory transaction, authenticated synthetic staging and explicit release approval. Publishing and automations remain disabled. **BLOCKED.**
