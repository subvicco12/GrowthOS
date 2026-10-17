# GrowthOS request-security edge certification — 2026-10-17

**Decision: production HOLD / NO-GO.** Reviewed base `2f91b6d2602977643d9bd1408e65f786500bddcb` on `feat/ci-cost-guardrails-20261011`. Node.js 22.16.0. No production, Hostinger, customer data, real credentials, deployment, GitHub Actions, publishing or automation was accessed or activated. Certified MariaDB backup/restore tests were not repeated.

## Review and fix

The shared guard requires exact configured HTTPS origin and matching canonical `Host`; forwarded Host/protocol headers are ignored. Its JSON reader checks declared length and consumes at most 4096 actual bytes, cancelling an oversized stream. Review found a confirmed encoding defect: `Buffer.toString('utf8')` silently replaces invalid byte sequences before JSON parsing. Fatal UTF-8 decoding now rejects these bytes as `INVALID_JSON` (HTTP 400), preserving JSON text fidelity. Logout's unused JSON-reader import was removed. The strict CSRF/Host comparison remains intact. No migration or backup/restore files changed.

## Executed checks

Commands used `PATH=/tmp/growthos-current/package/bin:$PATH` in the clean checkout. Exit codes are actual process results.

| Command | Exit | Observed result |
| --- | ---: | --- |
| `npm run test:mutation-security:offline` | 0 | 52 assertions: malformed Content-Length, invalid UTF-8, aborted/failed streams, streaming size cap and cancellation, canonical Host/Origin, authorization and tenant refusals |
| `npm run test:auth-cookies:offline` | 0 | 5 cookie and origin cases |
| `node scripts/test-feature-route-mocked.cjs` | 0 | 10 feature cases |
| `npm test` | 0 | 215 tests: 214 passed, 1 skipped, 0 failed |
| `npm run typecheck` | 0 | Passed |
| `npm run build` | 0 | Next.js production build passed |
| `npm run test:security:offline` | 0 | Offline source checks passed |
| `npm run test:db-guards:offline` | 0 | 8 guard refusals passed |

The first expanded test attempt exited 1 because a `Headers` object normalized leading whitespace in a synthetic `Content-Length` case; that expectation was corrected. The final 52-assertion run exited 0. A prior, unmodified helper would accept replacement-character JSON for invalid UTF-8; this is the fixed defect.

## Isolation and release blockers

No disposable `mariadbd` or `mariadb` executable, configured synthetic staging endpoint/accounts, or suitable isolated reverse proxy was present in this execution environment. Only the existing Node.js 22 toolchain and offline mocks were available. Authenticated owner/admin/viewer E2E across two organizations, session revocation, approval replay, audit persistence, ingress Host rejection and blocked direct-backend access are **NOT RUN**. They require a separately verified synthetic MariaDB-backed staging deployment and proxy, with direct backend reachability tested from outside the trusted ingress boundary. Source-level Host checks cannot establish that network property. Publishing and automations must remain disabled during that gate.

Fresh authorized read-only production metadata, precise runtime and installer grants, backup policy/restore ownership, measured RPO/RTO, monitoring and explicit release approval also remain open. This report authorizes no production action.
