# GrowthOS product and engine integration evidence

Integration branch: `integration/growthos-product-engines-20261018`. Outcome: offline integration PASS; production HOLD/NO-GO. No database, external provider, publisher, automation, production credential or Hostinger connection was used. All permissive feature flags and provider keys in tests are synthetic in-memory fixtures only.

## Verified lineage and tested code

| Reference | Verified SHA |
| --- | --- |
| Work A source HEAD | `9bb1a1c5de3b70b7c9279e22dbbbc1efc57d9ea5` |
| Work B source HEAD | `41615f07510aa04952472571fd8030c2790c82b3` |
| Common ancestor | `cb64d063e067bf513513359f8242c4ed9218c364` |
| Local source-only merge | `0399ae89dc6034e54f1e1fd041d94924d9c9c9bd` |
| Local tested implementation | `f59b56c8bc01ccff2671ee6fbec606b51fee77c0` |
| GitHub integration implementation, both source HEADs as parents | `271d0e2263989c4527d15f151dba6b3f432029d3` |
| Tested implementation tree, equal locally and in GitHub | `c291e31f1fc7cd0279f118f9fd2a0635f22fad57` |

The report is a documentation-only child of the implementation commit. Both source commits remain ancestors of the integration branch. Source branches and main were not updated. Existing workflow filters target main/phase branches or PR/manual dispatch, and no Actions workflow was dispatched or PR created.

Executed setup commands:

```sh
git fetch origin feat/growthos-product-completion-20261017 feat/growthos-engines-completion-20261017
git merge-base 9bb1a1c5de3b70b7c9279e22dbbbc1efc57d9ea5 41615f07510aa04952472571fd8030c2790c82b3
git worktree add -b integration/growthos-product-engines-20261018 /workspace/scratch/886c85eece52/growthos-integration 9bb1a1c5de3b70b7c9279e22dbbbc1efc57d9ea5
git -C /workspace/scratch/886c85eece52/growthos-integration merge --no-ff --no-edit 41615f07510aa04952472571fd8030c2790c82b3
ln -s ../growthos-release/node_modules node_modules
```

These commands exited 0; the merge had no conflicts. FETCH_HEAD recorded both requested source heads. An initial attempt to inspect `origin/feat/...` aliases failed because the checkout has a narrow fetch refspec; the actual fetched SHA objects were verified directly. Source attachment reviewed: Complete Master Blueprint & Architecture Bible, especially sections 24–25, 28–29, 32–33, 36–43 and 49–51. Section 49 controls chargeable execution counts; section 39 requires reservations before dispatch.

## Cross-module contract review

| Contract | Current result | Evidence and limit |
| --- | --- | --- |
| Organization identity | PASS offline | Work A derives organization from session and checked membership, not identity headers. Cursors bind organization/stream and SQL independently scopes every page. Engine adapters accept server-supplied scope; no public engine route was added. |
| Website scope and roles | PASS offline / BLOCKED live | Content and claim SQL include organization and website. CAS binds id/version. Viewer and unknown roles, foreign organization/site and stale versions are refused. Current certified memberships are organization-wide; separate per-website entitlements are not implemented. |
| Connector health | PASS offline / BLOCKED persistence | `core/connector-health.ts` is the common view/projector. Absent evidence is unknown; wrong scope, invalid/future time or expiry becomes unavailable; disconnected requires explicit evidence. Work A's route still supplies null because certified migrations have no probe table. Work B requires a fresh verified persisted row. Configuration never establishes verified health. |
| Content lifecycle and approvals | PASS offline / BLOCKED approval bridge | MariaDB transitions reapply the domain event, verify CAS and insert actor/kind/time/result evidence in the same transaction. Internal UI approval decisions remain internal. They are not treated as authority to publish a content asset. A content/version/destination approval bridge and current membership verification are required before activation. |
| Publication claims | PASS mocked / BLOCKED MariaDB | Claim insertion and `publication_unknown` content event commit atomically. Claim lock order is budget → site → content → claim → policy → connector → reservation. Reconciliation locks content → claim and cannot race a cancellation. Duplicate/preexisting claims return false, including verified absence. Site automation, publishing and per-content policy switches must all permit a claim. No outbound method was added. |
| Provider evidence and replay | PASS synthetic / BLOCKED real attestation | Reconciliation requires an explicit trusted issuer, a >=32-byte HMAC key, exact organization/site/content/channel/reservation/claim binding, valid signature and <=5-minute evidence lifetime. Default registry is empty. A durable `(organization,issuer,event)` journal rejects rebinding, permits exact replay, and commits observed publication/content/audit/claim status together. Tests use synthetic keys. |
| Audit integrity | PASS transaction model / BLOCKED database immutability | Content events retain actor, kind, time and resulting snapshot; signed observations retain hash and envelope. Proposed append-only journals and immutable claim keys require separately reviewed triggers/grants. Work A governance UI continues to expose selected feature and internal-decision history only. It is not a complete content audit interface. |
| Reservation and quota | PASS existing UTC guard / BLOCKED section 49 completion | Duplicate reserved jobs now recheck site, automation, global pause and connector controls. Existing UTC monthly accounting is preserved. Non-UTC sites still fail closed. Current reservation schema cannot distinguish reserved/chargeable units, provider settlement, refunds or local weeks. No claim of full canonical quota compliance. |
| Cost-center reporting | PASS mocked | API declares recorded completed reservation accounting, excludes reservation estimates and cancelled rows, marks provider-billed spend unavailable and settlement unverified, and leaves currency null. UI explains excluded cancellation charges and checks the returned organization. It exposes neither provider-invoiced spend nor a fabricated remaining balance. |
| Safety defaults | PASS offline | Registration remains draft-only with disabled/zero defaults and UI controls remain disable-only. No publisher, worker, external integration or automated schedule was activated. |

## Confirmed defects fixed

- Work B accepted connector verification without expiration or scope projection. The shared projector now refuses stale/future/foreign evidence.
- Unsigned caller observations could finalize a claim independently of content status. Signed evidence verification, replay storage and atomic content/claim reconciliation replace that path.
- A committed claim left content scheduled and cancellable. Claim creation now transitions content to publication_unknown in the same transaction.
- The generic ContentStore could be used to assert provider trust. It now requires event/actor audit evidence and refuses provider-status events; only the claim reconciliation path persists those transitions.
- Domain transitions denied viewers but allowed an unknown role for some events. Mutation roles are now explicitly owner/admin/editor.
- The pure budget ledger replay path could bypass a newly applied emergency pause or revoked connector. It now rechecks those gates before returning an existing reservation.
- Claim checks now also require the website automation switch, per-content policy switches, a valid due time and a scoped completed reservation of the correct content type with a recorded cost.

## Executed verification

All commands below ran from `/workspace/scratch/886c85eece52/growthos-integration`, sequentially. Runtime: Node `v24.19.0`; dependencies reused from the existing worktree. No installation or Node 22 parity was claimed. Final unit/typecheck/build runs followed the final policy/automation guard changes.

| Command | Exit | Actual result |
| --- | ---: | --- |
| `node --import=tsx --test src/core/__tests__/product-engine-integration.test.ts` | 0 | 14 synthetic integration tests passed. |
| `node --import=tsx --test src/core/__tests__/mysql-content-persistence.test.ts src/core/__tests__/product-engine-integration.test.ts` | 0 | 19 focused tests passed after final claim guard changes. |
| `npm test` | 0 | 252 tests: 251 passed, 1 existing skip, 0 failures. |
| `node scripts/test-governance-route-mocked.cjs` | 0 | Eight grouped route cases, including tenant/cursor scope, unknown connector and cost-basis assertions. |
| `npm run typecheck` | 0 | Final TypeScript no-emit check passed. |
| `npm run build` | 0 | Final Next.js production compilation passed. |
| `npm run test:security:offline` | 0 | Offline source security checks. |
| `npm run test:mutation-security:offline` | 0 | 52 mocked mutation-security assertions. |
| `npm run test:auth-cookies:offline` | 0 | Five mocked login/logout cookie cases. |
| `node scripts/test-feature-route-mocked.cjs` | 0 | Ten mocked disable/security cases. |
| `node scripts/test-growth-engine-db-boundary-mocked.cjs` | 0 | Non-UTC reservation refuses before policy/insert and rolls back. |
| `npm run test:db-guards:offline` | 0 | Eight refusals; no connection authorized. |
| `git diff --check` | 0 | No whitespace errors. |
| `git diff cb64d063e067bf513513359f8242c4ed9218c364 -- database/mysql scripts/mariadb-migration-runner.cjs scripts/disposable-backup-restore-rehearsal-candidate.cjs scripts/disposable-staging* .github/workflows` | 0 | Empty output: certified database files, named safeguards/staging files and workflows preserved. |

FAIL during implementation: an initial typecheck exited 2 because three old fixtures passed raw observations after the reconciliation interface required signed evidence. Fixtures were corrected; focused and full final checks passed. No current executed check is failing. Security regression scripts completed before the final claim policy/automation guard refinement; the affected persistence tests, full unit suite, typecheck and build were rerun after it.

The SQL fixture is a serialized in-memory simulator with rollback snapshots and modeled unique constraints. It does not parse SQL or certify MariaDB locking, gap-lock behavior, deadlocks, DDL syntax, foreign keys, indexes, triggers, privileges or actual crash durability. No certified backup/restore tests were repeated. No authenticated staging E2E or Chrome device review ran.

## Schema decisions and remaining release gates

`docs/work-b-persistence-schema-proposal-20261018.md` is the updated proposal. Certified migrations 001–009 were neither modified nor installed. The five proposed new tables would bring the certified 15-table inventory to 20. The nine pinned migration hashes and four existing audit triggers must be preserved during a separately authorized schema review.

BLOCKED pending separate review and execution:

1. Approve additive DDL, migration number/hashes, charset/collation, index widths, scoped reservation FK/index, triggers and least-privilege grants. Prove the new journals cannot be changed or deleted and claim identity/terminal states cannot be reset.
2. Run real isolated MariaDB 11.8 concurrency, recovery, FK, privilege, immutability and migration/rehearsal certification. The adapters fail closed on the certified schema because their proposed tables do not exist.
3. Implement trusted connector probe writers and production issuer/provider attestation, issuer rotation/revocation loading and evidence retention. HMAC tests do not certify a real provider integration.
4. Define and certify the internal-approval-to-content/version/destination authorization bridge. A UI approved decision is never substituted for publication permission.
5. Resolve late/contradictory observations and absent-publication recovery without clearing a claim. Absence remains terminal and content remains ambiguous until an audited recovery design is approved.
6. Implement the reviewed site-local-week/chargeable-execution/refund ledger while preserving portfolio UTC months. Existing cancellation accounting and completed-only cost reporting cannot establish reconciled provider spend or full section 49 compliance.
7. Complete Node 22 parity, isolated authenticated staging, accessibility/device verification and the independent release gates under separately authorized conditions.

No production release, publication or automation activation is authorized by these offline results. GrowthOS remains HOLD/NO-GO.
