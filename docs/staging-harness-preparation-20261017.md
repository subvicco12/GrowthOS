# GrowthOS staging harness preparation — 2026-10-17

**Decision: production HOLD / NO-GO.** Base branch `feat/ci-cost-guardrails-20261011` at `09dba8753a7551598fec9b120504a1229280e520`. This is a future-environment staging package, not an executed staging certification. No production, Hostinger, real credentials, paid service, publishing, automation, GitHub Actions, merge or deployment was used.

## Prepared artifacts

- `staging/compose.yaml` builds the app from a digest-pinned Node 22 image and runs MariaDB 11.8 and a minimal HTTPS proxy from pinned images on a private internal network. MariaDB and proxy ports publish to host loopback only; app port 3000 is not published. Database storage is tmpfs. `staging/Dockerfile` and root `.dockerignore` exclude local dependencies, keys and environment files from the build context.
- `staging/preflight.cjs` refuses non-Node-22, CI, non-disposable schema, non-loopback database endpoint, missing/distinct synthetic credential marker, non-digest image, non-local Docker context, missing local cert, image version mismatch, public Compose binding, app publication and non-internal network. It prints no credentials.
- `staging/fixture.mjs` and `staging/seed.mjs` define two synthetic organizations, six reserved-domain users (owner/admin/viewer in each), two draft websites with automation and auto-publish false, and one internal approval. Seed refuses existing application rows and requires nine migration ledger entries and MariaDB 11.8 identity.
- `staging/e2e.mjs` prepares real HTTPS login/selection/logout, tenant/role denials, approval replay, immutable audit trigger assertions, idempotent feature disabling, canonical Host/Origin, spoofed forwarding, unknown Host, and absence of host-published backend port. It checks flags remain disabled. Because flags remain off, a true-to-false feature audit transition is deliberately **not covered**; a separate reviewed safe synthetic fixture is needed for that gate.
- `staging/README.md` contains the future setup and stop procedure. Neither runner automatically retries partial DDL or cleans a failed schema.

## Executed offline checks

| Command | Exit | Observation |
| --- | ---: | --- |
| `for f in staging/preflight.cjs staging/proxy.cjs staging/test-contracts-offline.cjs staging/fixture.mjs staging/seed.mjs staging/e2e.mjs; do node --check "$f" || exit 1; done` | 0 | Six syntax checks passed with available Node 24.19.0 |
| `node staging/test-contracts-offline.cjs` | 0 | 18 static contract assertions passed; no containers/DB/HTTP |
| `node staging/preflight.cjs` | 2 | Correct refusal: Node.js 22 required; Docker/MariaDB/proxy remain unavailable here |

The combined shell wrapper expected the preflight refusal and exited 0; the preflight process itself exited **2**. No authenticated staging HTTP request or database assertion has been executed. No certified migration or backup/restore script was changed.

## Required live gates

In a fresh local environment, verify Docker socket/context, pinned image digests and runtime versions, local certificate, actual network bindings, empty disposable `growthos_test_*` identity and synthetic-only credentials. Install reviewed migrations once, seed once, then run E2E and retain sanitized HTTP/SQL results. Independently test direct-backend reachability from the intended ingress boundary and perform the separate safe true-to-false feature audit test. Stop on any mismatch. Production metadata, grants, backup operations and explicit release approval remain separate HOLD gates.
