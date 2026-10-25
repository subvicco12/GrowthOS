# GrowthOS candidate 010–016 certification package — review only

Starting GitHub HEAD `e584280dc5649c4ef0b2a66a73c29646200f82d4` on `feat/growthos-final-product-closure-20261024`. Production **HOLD / NO-GO**. No database connection or migration installation was made in this work.

## Exact provenance and order

Candidates 010 and 012 were recovered byte-for-byte from existing Git history into `database/proposals/certification-010-016/`. They are review copies, not registered migrations. The seven files, source commits and hashes are:

| Order | Source commit and original path | SHA-256 | Tables | Triggers | FKs / FK columns |
| --- | --- | --- | ---: | ---: | ---: |
| 010 | `ec73ed9ff2ea308afc048b62bd06cc391401e21a` — `database/proposals/010_content_persistence_candidate.sql` | `bb10b32ec0186399ae10b1820541d4330aab500843cd0fcf2a82b4da515c2c5b` | 5 | 7 | 6 / 17 |
| 011 | `2b8eafb62503c99e5698065f25c8ad0bce2fa4ff` — `database/proposals/011_authorization_trust_candidate.sql` | `7b9f5b15d2797c13bc6c30d04a08d49b5112a2545f264b543e86ffd5b303362a` | 8 | 17 | 19 / 52 |
| 012 | `5d2bbc5bd52d5077b95d139b0751de623284df0d` — `database/proposals/unified-v2/012_quota_v2_candidate.sql` | `6d32ff6a950e9e90c40a4c5e5892c783914847c0f518faab980f08764bc310a6` | 3 | 7 | 7 / 22 |
| 013 | `cea50c0574fd718fb6cf144d256371803b661a2d` — `database/proposals/publication-funding-v1/013_publication_funding_jobs_candidate.sql` | `049f16c9c9eb9336c60b9d3ebf42d5f66763257146d4d99714b0f74e7aea481e` | 3 | 7 | 9 / 41 |
| 014 | `78f0360f48e6fc2bdf3dc814da29a98726cf06a3` — `database/proposals/publication-observation-scope-v1/014_observation_scope_candidate.sql` | `d341bb3bc004b332f7cbc8253c2e5eb5255a4b8120860ae5d453f87762ee71b8` | 0 | 0 | 2 / 14 |
| 015 | `badbaee3495308e790ddaf287968e2384124a1fa` — `database/proposals/product-authority-v1/015_product_authority_candidate.sql` (later revision of original `851cd521…`) | `50dc53b228a391bfe221cf92e7c855fedfb39c1ced1ed452da1aa56b96446551` | 7 | 12 | 12 / 19 |
| 016 | `9385d508b971145fef5a589d62344902dfc8fa98` — `database/proposals/recommendation-review-v1/016_recommendation_review_candidate.sql` | `a2017e1daab3a27d37436ed8e45853e9bbb9ed5ec9d8ef0e480f1395f274377b` | 3 | 6 | 5 / 12 |

`static-chain-inventory.json` lists exact candidate table and trigger names. After baseline 001–009, candidate 010 supplies content/claim/observation parents for 011; 012 requires 010 content and existing content policy; 013 requires 010–012 claim, authorization and quota keys; 014 alters 010/013 observation/job tables; 015 requires baseline website/user/organization keys; 016 requires 015 evidence and baseline website/user keys. The offline verifier checks FK target table ordering and column arity. It does **not** establish FK data-type/collation compatibility or runtime trigger behavior.

The proposed full inventory is **44 tables** (including baseline ledger), **60 triggers**, **200 FK columns**, **16 ledger entries**. Candidate 014 is an ALTER-only amendment, so partial DDL is especially unsafe. These are static expected counts, not observed MariaDB results. Baseline 001–009 and existing recovery tools were not modified.

## Unresolved contract issues

1. Candidate 016 records `evidence_revoked_at` locally, whereas 015 keeps manual evidence immutable and records revocation in a separate event table. A 015 revocation does not automatically change 016's local field. A current evidence authority or separately reviewed transactional propagation must deny stale recommendations before enabling review decisions.
2. Candidate 015 usage event status and aggregate counters require tightly scoped SQL principals and authoritative transition checks. Static triggers alone do not prove every plan usage state change has a matching immutable transition event. A disposable two-session grant and audit test must establish this.
3. Candidate 011 connector trust state and 012 quota balances still depend on independent signing-key custody, revocation/fencing and budget authorities. A normal MariaDB row cannot independently anchor monotonic trust. Publication remains disabled.
4. Exact FK definitions, column collations, index widths, CHECK enforcement, trigger order and grants require MariaDB 11.8 validation. Any defect needs a separately reviewed additive correction; pinned SQL stays unchanged.
5. DDL commits implicitly. If any candidate statement fails, quarantine the partial `growthos_test_*` schema and restart from a newly created empty disposable schema after review. Never resume by skipping statements, edit the ledger, or restore a partially installed schema.

## Execution boundary and future certification

`scripts/verify-review-migration-chain-offline.cjs` verifies seven pinned hashes, exact counts, order and FK parent presence. `scripts/review-candidate-disposable-preflight.cjs --plan` is offline; `--probe` performs read-only database identity, emptiness, grant count and two-session checks only after separate operator isolation verification and synthetic loopback configuration. It has **no install mode**. `scripts/verify-review-recovery-manifest-offline.cjs` compares proposed table/trigger/ledger names and per-table count/digest shapes; it does not parse or restore dump bytes. Existing certified dump guards remain unchanged.

Future separately authorized environment requirements: Node 22, isolated disposable MariaDB 11.8 with `@@bind_address=127.0.0.1`, two distinct sessions, synthetic least-privilege principals, freshly created empty `growthos_test_*` source and destination schemas, verified candidate hash manifest and independent network/process isolation evidence. First run baseline 001–009 and its ledger, independently review candidate parser and all 010–016 SQL, then install only into the disposable schema. Certify FK/index/trigger definitions and full ledger, concurrent claim and quota/plan reservation, approval and connector revocation races, tenant separation, rollbacks, uncertain COMMIT recovery, audit immutability and scoped grants. Populate synthetic rows, use a separately versioned expanded dump validator, restore into a second empty disposable schema, compare deterministic table counts/content digests, and refuse unsafe/corrupt/partial restore. The **candidate installer and expanded dump validator are not yet implemented or certified**; no existing production installer must be used for this chain.

## Offline evidence

Node.js `v24.22.1`, npm `11.9.0`; these checks are provisional until Node 22 parity.

| Executed command | Exit | Evidence |
| --- | ---: | --- |
| `node --check scripts/{verify-review-migration-chain-offline,review-candidate-disposable-preflight,verify-review-recovery-manifest-offline}.cjs` (each separately) | 0 each | Syntax passed |
| `node scripts/verify-production-migration-package.cjs` | 0 | Baseline offline package passed |
| `node scripts/check-mariadb-parser.cjs` | 0 | 19 baseline statements extracted |
| `node scripts/test-review-migration-chain-offline.cjs` | 0 | Seven pinned candidates; mutation, missing-file and ordering refusals |
| `node scripts/test-review-candidate-preflight-offline.cjs` | 0 | Ten environment refusals |
| `node scripts/test-review-recovery-manifest-offline.cjs` | 0 | Synthetic inventory and corrupted-manifest refusals |
| `node scripts/review-candidate-disposable-preflight.cjs --plan` | 0 | Offline-only plan |
| `node scripts/review-candidate-disposable-preflight.cjs --probe` | 2 | Expected refusal without explicit opt-in; no connection |
| `node scripts/review-candidate-disposable-preflight.cjs --install` | 2 | Expected unsupported-mode refusal; no SQL |
| `npm test` | 0 | 523 tests: 522 passed, one skipped |
| `npm run typecheck` | 0 | Passed |
| `npm run test:security:offline` | 0 | Passed |
| `npm run test:auth-and-session:offline` | 0 | Passed |
| `npm run test:mutation-security:offline` | 0 | 52 assertions passed |
| `npm run test:db-guards:offline` | 0 | Eight refusals passed |
| `NEXT_TELEMETRY_DISABLED=1 CIRCLE_NODE_TOTAL=2 npm run build` | 0 | Capped build passed |

None of the static or mocked checks certifies MariaDB behavior, backup/restore, trust authority or authenticated staging. Production remains HOLD / NO-GO.
