# GrowthOS Work B — offline engine contract evidence

Branch `feat/growthos-engines-completion-20261017` starts at `cb64d063e067bf513513359f8242c4ed9218c364`. This audit uses the supplied Complete Master Blueprint & Architecture Bible, particularly sections 4–16, 23–25, 29–32, 37–40, 43 and 47–51. No provider, database, publishing or scheduled automation was activated.

## Workflow inventory

| Capability | Existing implementation | This work | Integration boundary |
| --- | --- | --- | --- |
| Competitor/package intelligence | `competitive-intelligence.ts`, `competitor-discovery.ts`, `competitive-evidence.ts`, `competitor-jobs.ts` score submitted observations and dated snapshots. | Duplicate feature rows count once per peer; invalid capture dates refused. | No certified live discovery/source adapter or scheduled scan. Job handler takes an injected source. |
| SEO | `seo-intelligence.ts` inspects supplied page measurements. | No external provider or crawl change. | Sitemap/Search Console/analytics are not connected or certified; findings require actual evidence. |
| CRO | `cro-intelligence.ts` ranks supplied funnel counts. | Impossible conversion counts excluded. | No live event feed or controlled A/B experiment registry. |
| Monetization/revenue | `revenue-intelligence.ts`, measurement certification modules summarize supplied events. | No currency or causal uplift claim added. | No reconciled billing/affiliate/ads data; USD summary type is not multi-currency certification. |
| Recommendations | `growth-intelligence.ts` and recommendation modules rank supplied signals; Postgres adapters exist. | Non-finite scores rejected; evidence-free next-best actions hidden. | Postgres jobs/recommendation repositories are not wired to the current MariaDB runtime. |
| Content factory | No connected production lifecycle at baseline. | `content-lifecycle.ts` defines source-backed research → draft → quality → manual approval → schedule → trusted publication observation → attribution; versioned transitions and tenant/role checks. | `ContentStore` is an atomic compare-and-swap contract only; no durable MariaDB implementation, media store, policy reviewer or external provider. |
| Publication | Legacy WordPress command adapter exists; no certified content publication path. | `publication-handoff.ts` requires approval, reservation, due schedule, explicit connector and feature gates, and an atomic one-time claim. Unknown outcomes require remote status inquiry. | No claim store, status probe or publisher adapter connected. Pure synthetic test of an enabled gate sends nothing. Publishing remains disabled. |
| AI quota/budget | `ai-budget-ledger.ts` serializable adapter contract; `mysql-budget-store.ts` locks org/site rows and checks caps; reconciliation stores actual costs. | Non-UTC websites now fail closed before any paid reservation because current shared period key cannot implement both website-local week and portfolio UTC month safely. Concurrent last-slot test uses a serialized synthetic adapter. | No MariaDB integration in this environment; daily/channel caps, provider settlement lag and timezone-aware schema need a separately reviewed design. The existing reservation currently counts reserved units before chargeable execution, differing from section 49. |
| Jobs/connectors | `jobs.ts` has leases, retry/backoff and sanitization; connector security verifies signatures/nonces. | Synthetic provider failure and safe cancellation tests. | Postgres queue adapters, connector capabilities, OAuth, media rights and real provider rate limits are not integrated into a certified runtime. |

## Security and behavior

- A content record is scoped to organization and website on every transition; viewers cannot mutate. Source URLs must be HTTPS, quality requires facts, originality, rights and disclosure, and regulated content requires a recorded YMYL review.
- Manual approval precedes scheduling. Only a trusted provider-evidence adapter may mark publication observed. Ambiguous publication cannot be retried or cancelled without a status check.
- Publication preparation only creates a claim through an injected atomic store. It performs no outbound action. An unavailable store, disabled switch, global pause, absent reservation or unverified connector prevents the claim.
- New websites retain draft/zero-budget/disabled defaults. No API route, activation mechanism, queue schedule or provider secret was added.

## Commands executed

Runtime: Node v24.19.0 with preinstalled dependencies shared through a worktree symlink; Node 22 parity was not executed. Baseline commit was verified locally before edits.

| Command | Exit | Result |
| --- | ---: | --- |
| `npm test` | 0 | 224 tests: 223 passed, 1 skipped, 0 failed; includes nine new lifecycle/evidence tests. |
| `npm run typecheck` | 0 | TypeScript no emit. |
| `node scripts/test-growth-engine-db-boundary-mocked.cjs` | 0 | Non-UTC reservation rollback before policy/insert. |
| `npm run build` | 0 | Next.js production build compiled. |
| `npm run test:security:offline` | 0 | Source checks. |
| `npm run test:mutation-security:offline` | 0 | 52 assertions reported by script. |
| `npm run test:auth-cookies:offline` | 0 | Five login/logout cookie cases. |
| `node scripts/test-feature-route-mocked.cjs` | 0 | Ten disable/security cases. |

An in-progress unit run failed one legacy fixture that used `capturedAt: 'x'`; the fixture was corrected to a dated synthetic timestamp and the full suite passed. The new database-boundary script initially had a CommonJS variable naming error; it was corrected and passed. No MariaDB server, provider sandbox, external integration, end-to-end publish, or staging test was run. Production remains HOLD/NO-GO.
