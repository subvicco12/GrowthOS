# GrowthOS synthetic staging isolation check — 2026-10-17

**HOLD / NO-GO; authenticated staging E2E NOT RUN.** Development branch `feat/ci-cost-guardrails-20261011` at `03bf2b57ddf9c985c37d91748f0b39b8ecef041a`. This check used no production/Hostinger access, credentials, customer data, paid resource, publishing, automation, GitHub Actions, deployment, migration or backup/restore operation.

## Read-only inventory and exact outcomes

| Command | Exit | Observation |
| --- | ---: | --- |
| `git fetch origin feat/ci-cost-guardrails-20261011 && git switch --detach 03bf2b57ddf9c985c37d91748f0b39b8ecef041a` | 0 | Branch commit verified |
| `rg --files | rg '(staging|fixture|integration|migration|proxy|nginx|caddy|docker|compose)'` | 0 | Found `compose.mariadb-test.yaml`, migration and approval-integration scripts; no authenticated staging/proxy harness |
| `for x in node npm docker podman mariadbd mariadb nginx caddy; do command -v "$x" ...; done` | 0 | `node` and `npm` present; Docker, Podman, MariaDB server/client, nginx and Caddy missing |
| `find /workspace/scratch/886c85eece52 /tmp -maxdepth 4 -type f ...` | 0 | No MariaDB, proxy or Node 22 binary at searched locations |
| `node --version` | 0 | `v24.19.0` (not Node 22) |
| `test -S /var/run/docker.sock` | 1 | No Docker socket |
| `test -S /run/mysqld/mysqld.sock` | 1 | No local MariaDB socket |

The existing Compose file describes a `mariadb:11.8` disposable container with loopback-only `127.0.0.1:33317:3306` and tmpfs storage, but no container runtime/socket is available. `scripts/run-approval-integration.mjs` enforces `growthos_test_*`, loopback host and disposable opt-in; it is not a full HTTP E2E harness. `scripts/disposable-dump-fixture.cjs` produces SQL text for offline dump validation, not staging accounts. Migrations default automation and auto-publish to false, but no running synthetic database exists to assert state.

## Required isolated staging components

A verified free local container runtime or independently isolated MariaDB 11.8.x server; Node.js 22; disposable `growthos_test_*` schema and synthetic credentials; a staging fixture for two organizations and owner/admin/viewer accounts; a local HTTPS reverse proxy with a pinned canonical Host, unknown-Host rejection and blocked direct backend access; and an authenticated HTTP test harness with database assertions. Verify loopback-only database exposure, proxy/backend network policy and disabled publishing/automations before starting tests. No production endpoint or real credentials may be substituted.

**Not run:** migrations, synthetic seeding, real HTTP login/selection/logout, revocation, cross-tenant and role checks, approval replay, audit integrity, feature disable, forwarded-header and ingress rejection tests. Existing offline and backup/restore certifications were not repeated. No application defect was established and no application code changed. Production release remains HOLD pending independent staging and other documented release gates.
