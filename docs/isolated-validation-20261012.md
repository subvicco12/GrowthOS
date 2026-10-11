# Isolated development validation

Validated branch `feat/ci-cost-guardrails-20261011` from commit `ce894e8465e71bd13791fa77e24d5eb7206386f9`.

Environment: Node 24.19.0, npm 11.9.0, separate scratch directory. Source snapshot verified against Git blob hashes. No production credentials or environment files were loaded. Validation commands ran with a clean environment and an inherited Linux seccomp filter denying IPv4 and IPv6 socket creation (both verified to return EPERM). Install lifecycle scripts, npm audit, and Next.js telemetry were disabled. Network namespaces were unavailable; seccomp supplied network isolation for the checks.

## Actual execution results

| Check | Initial result | After fixes |
| --- | --- | --- |
| npm install --ignore-scripts --no-audit --no-fund | PASS, 45 packages | PASS, 13 additional packages for missing declared imports |
| npm test | FAIL: 205 passed, 6 failed, 1 skipped | PASS: 214 passed, 0 failed, 1 skipped (215 total) |
| npm run typecheck | FAIL: 6 TypeScript diagnostics | PASS, exit 0 |
| npm run build | FAIL: missing Supabase module declaration | PASS, exit 0; optimized Next.js build and six static pages generated |

## Verified fixes

- Declared pinned `@supabase/supabase-js` 2.117.3 and `@supabase/ssr` 0.12.7 dependencies for existing retained source imports; added package-lock.json. No database access or migration was performed.
- Replaced the incorrectly inferred promisified scrypt overload with a typed callback-to-Promise wrapper that preserves the existing cryptographic options and error propagation. Existing password verification and salting tests pass.
- Added an explicit missing-user-ID guard before profile lookup.
- Updated five stale tests targeting a replaced global dashboard to validate organization-scoped sections, draft-only registration, read-only automation status, API-sourced overview, and disabled legacy adapters. The legacy route test executes GET dashboard and POST approvals and verifies 503, no-store, and the disabled response. These checks do not certify that all 22 blueprint engines are implemented.

## Limits

The disposable MySQL integration test was intentionally skipped; the user prohibited database connections. No live authentication, database behavior, production smoke test, or deployment was certified. The local Node version differs from CI's Node 22. No GitHub Actions, PR, merge, deployment, paid service, production change, or automation activation occurred. Local test/type/build readiness passes; production release readiness remains unverified.
