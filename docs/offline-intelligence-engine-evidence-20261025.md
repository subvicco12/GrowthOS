# GrowthOS offline intelligence engine — 25 October 2026

**Source GitHub HEAD:** `b526c9b4a4cb22c2668000d0e741e38461dc91b8` on `feat/growthos-final-product-closure-20261024`. **Production HOLD / NO-GO.** This package is synthetic and offline. No live URL fetcher, DNS authority, database-backed recommendation writer, publisher, worker or payment path was added.

## Executable contracts

- `src/core/offline-website-discovery.ts`: provider-independent synthetic transport limited to relative paths. Requires current ownership/tenant/policy authority, a claimed job key and rate authority before transport use; rechecks before each page. Validates HTTPS canonical host and every reported redirect, refuses IP literals/local hostnames, applies bounded robots rules, parses a restricted sitemap grammar, deduplicates paths and enforces page/depth/time/response limits. Abort and timeout clear partial results; unknown robots/sitemap/redirect outcomes fail closed. Unsupported robots or XML grammar refuses rather than guessing. Claim/rate authority implementations are intentionally not provided for production.
- `src/core/evidence-growth-opportunities.ts`: deterministic SEO, content, conversion and usability opportunities from explicitly present observations only. Carries a source hash, observed time, freshness, limited confidence and unknown cost. No ranking/revenue/performance score is invented.
- `src/core/offline-growth-pipeline.ts`: connects discovery to synthetic page observations with exact URL, response status, hash and time checks. Adds manually approved, dated competitor feature claims as **unverified review-only** ideas. It does not scrape a competitor or treat its claim as independently verified.
- `src/core/offline-recommendation-review.ts`: a transaction interface for tenant-scoped locked CAS, append-only event, idempotent decisions and fresh authority/budget/feature checks. Accept means **planning only**. Revoked evidence or membership, stale revisions, unknown budget and replay conflicts refuse. A transaction provider that reports uncertain COMMIT propagates the error; no automatic retry is supplied. There is no production store implementation or route.
- `src/app/intelligence-panel.tsx` shows an unavailable discovery state and filters manual preview ideas by category, with supporting source and explicit unavailable review history/decision status. It cannot create a decision.

## Executed checks on Node.js v24.22.1 (provisional)

| Command | Exit | Evidence |
| --- | ---: | --- |
| `node --import=tsx --test src/core/__tests__/offline-website-discovery.test.ts src/core/__tests__/offline-growth-pipeline.test.ts src/core/__tests__/growth-opportunity-review.test.ts src/core/__tests__/product-workspace.test.ts` | 0 | 14 passed after a test fixture typing fix |
| `npm test` | 0 | 516 tests; 515 passed, one skipped, zero failed |
| `npm run typecheck` | 0 | TypeScript passed |
| `npm run test:security:offline` | 0 | Source checks passed |
| `npm run test:auth-and-session:offline` | 0 | Cookie/session mocked checks passed |
| `npm run test:mutation-security:offline` | 0 | 52 offline assertions |
| `npm run test:db-guards:offline` | 0 | Eight guard refusals |
| `node --import=tsx scripts/test-intelligence-preview-mocked.cjs` | 0 | 46 route mock assertions |
| `NEXT_TELEMETRY_DISABLED=1 CIRCLE_NODE_TOTAL=2 npm run build` | 0 | Capped Next.js 15.5.24 build |

The first typecheck of new tests exited 2 for a readonly tuple/computed-key fixture; its corrected test and the later full typecheck passed. These are synthetic tests, not live crawling, MariaDB atomicity or actual Android Chrome certification.

## Blocked boundary and next integration

Before real discovery: independently verified ownership and tenant membership, durable job claim/rate/quota store, an outbound destination authority that resolves and pins public DNS addresses through each connection and redirect, SSRF/rebinding tests, bounded streaming and robots/sitemap parser review, and explicit authorization to crawl. Before actual recommendation decisions: separately reviewed durable schema, one-connection atomic CAS/event implementation, session/role/evidence/budget/feature authorities, unknown-COMMIT reconciliation, and authenticated two-organization staging. Node 22 parity and disposable MariaDB 11.8 certification are outstanding. Production publishing, payments and automation remain disabled.
