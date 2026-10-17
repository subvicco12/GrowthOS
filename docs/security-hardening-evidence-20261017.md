# GrowthOS non-production security hardening — 2026-10-17

**HOLD / NO-GO.** Base branch `feat/ci-cost-guardrails-20261011` at `8f2dac374579ad8a82160ec14d7886ec2064f571`. Node.js 22.16.0. No production, Hostinger, customer data, real credentials, publishing, automation, deployment, GitHub Actions, or MariaDB restore operation was used.

## Confirmed fixes

- Cookie-authenticated mutation routes for login, logout, organization selection, both draft registration paths, approval decisions and feature disabling require an operator configured `GROWTHOS_APP_ORIGIN` that is an exact canonical HTTPS origin. Both request `Origin` and `Host` must match it. `X-Forwarded-Host` and `X-Forwarded-Proto` are never used to establish trust. Missing or malformed configuration fails closed with HTTP 403. The reverse proxy must preserve the public Host, reject all other Hosts before routing, prevent direct access to the app, and set `GROWTHOS_APP_ORIGIN` to the public HTTPS origin. This ingress requirement is not proven by source tests.
- Login, selection, both registration routes, approval decisions and feature disabling use a shared 4096-byte streaming JSON reader. Oversized declared or actual bodies return HTTP 413; malformed JSON returns HTTP 400. Login's invalid credential response and the other schema/authorization responses remain route specific. Logout has no JSON body to parse.
- Draft registrations still set automation and auto-publish false; feature mutation remains disable-only. Migration runner and backup/restore code were not changed.

## Executed checks (all exit 0)

| Command | Actual result |
| --- | --- |
| `npm test` | 215 tests, 214 passed, 1 skipped, 0 failed |
| `npm run typecheck` | TypeScript passed |
| `npm run build` | Next.js production build passed |
| `npm run test:security:offline` | Offline source checks passed |
| `npm run test:db-guards:offline` | Eight DB guard refusals passed |
| `npm run test:mutation-security:offline` | 43 offline route assertions passed across five JSON mutation routes and the shared guard |
| `npm run test:auth-cookies:offline` | Five mocked login/logout cases passed |
| `node scripts/test-feature-route-mocked.cjs` | Ten mocked feature cases passed |

All commands used `PATH=/tmp/growthos-current/package/bin:$PATH`. One exploratory combined shell invocation printed a failing cookie test (`ReferenceError: process is not defined` in the VM mock), while the shell's final exit was 0 because commands were not chained fail-fast. The VM mock was corrected; the direct rerun and final script command each exited 0. A new test initially returned 503 instead of 403 because its VM used a different `Error` constructor; the test VM was corrected and 43 assertions then exited 0. These were test harness defects, not application failures.

## Remaining gates

No independently verified isolated synthetic staging endpoint, account fixture with owner/admin/viewer in two organizations, or trusted reverse-proxy configuration was available. Authenticated staging E2E is **NOT RUN**, including session revocation, CSRF through ingress, cross-tenant request denial, approval replay, feature-disable audit and publication/automation state. Confirm canonical Host enforcement at ingress and no direct backend path before testing. Exact runtime/installer grants, fresh authorized read-only production metadata, provider backup retention and recovery ownership, monitoring, measured RPO/RTO and explicit release approval remain open. This document does not authorize production work.
