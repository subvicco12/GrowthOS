# GrowthOS Cloud Runtime Repair and Baseline Certification

Verified: 2026-10-31 UTC.

## Outcome

**Baseline certification PASSED on the required commit under Node.js 22. Substantial application development can begin on this verified checkout.** Published environment identity and automatic startup execution remain unverified platform configuration questions. No feature development was performed.

## Repository and source verification

- Repository: `/workspace/GrowthOS`, origin `https://github.com/subvicco12/GrowthOS.git`.
- Initially selected source: branch `work`, commit `707b5ebbce09291c7c5142c25127e7b840df3243`; only `work` was initially available locally. This was an incorrect task source selection, not an equivalent checkout of the required branch.
- GitHub verification: `git ls-remote --exit-code origin refs/heads/feat/growthos-final-product-closure-20261024` exited **0**, returning exactly **`9d813e8f614c43bcba9e19d1bf34315c006a6e37`**.
- Fetched only the required feature branch into its origin remote ref; fetch exited **0**. Created and selected local branch **`feat/growthos-final-product-closure-20261024`** at the exact required starting commit above. Final branch and HEAD checks confirmed both.
- Tracking setup was rejected by this checkout's ref configuration; explicit `git switch --no-track -c ... 9d813e8...` succeeded. No upstream tracking was installed. No remote branch or existing local branch was rewritten; no push occurred.
- Previous report preserved at `/tmp/growthos-previous-progress-report.md`; its old-checkout failures are superseded by this certification.

## Node and dependency repair

Platform default: Node **v24.19.0**, npm **11.9.0**. Downloaded official Node **v22.23.4** Linux x64 from nodejs.org into `/workspace/.growthos-runtime`; SHA-256 verification against published SHASUMS256.txt passed. Installation and certification used Node **v22.23.4**, npm **10.9.9**.

Activate the repaired runtime in each subsequent shell:

```sh
. /workspace/.growthos-runtime/activate.sh
cd /workspace/GrowthOS
node --version
npm --version
```

The activation file prepends the workspace Node 22 bin directory to PATH and sets writable `NPM_CONFIG_CACHE=/workspace/.growthos-runtime/npm-cache`. This does not change platform defaults or published startup configuration.

Inspected package.json and package-lock.json from the correct commit (lockfile version 3). **`npm ci --no-audit --no-fund` exited 0**, adding **58 packages**. `npm ls --depth=0` exited **0** with all 12 declared direct dependencies installed. It also listed optional WASM packages `@emnapi/runtime` and `@img/sharp-wasm32` as extraneous; baseline checks still passed.

Lockfile SHA-256: `d9d364cd86b4227bea0c75c8c7a97b8ca96a2121d4eb0b545cc7fb3e77aeebff`. No package or lockfile changes. Next.js regenerated next-env.d.ts during build; it was restored to the exact HEAD content afterward. Local generated artifacts were excluded through `.git/info/exclude`. No tracked application source or configuration was changed.

## Executed test results

All commands ran from the correct checkout using Node 22.23.4. No production Supabase or WordPress credentials were supplied or required. Build used `NEXT_TELEMETRY_DISABLED=1`.

| Command | Exit code | Actual result |
| --- | --- | --- |
| `npm test` | **0** | TAP: 103 tests, 103 passed, 0 failed, 0 cancelled, 0 skipped, 0 todo; duration 62750.457099 ms. This is the runner's reported count. |
| `npm run typecheck` | **0** | `tsc --noEmit` completed without diagnostics. |
| `npm run test:security:offline` | **0** | PASS: offline source checks; script accessed no database or network. |
| `npm run build` | **0** | Next.js 15.5.24 optimized build, type validation, static generation (5/5), and build traces completed. |
| `npm run test:db-guards:offline` | **1 initially; 0 on retry** | Initial sandbox run failed because approval-runner child output was empty instead of the expected refusal. Retry using supported network permission passed all 8 refusal checks without code changes. No DB connections were authorized by these negative cases. |
| `npm run test:auth-cookies:offline` | **0** | 14 reported PASS cases covering login/logout, cookies, membership, malformed inputs, and origin/Host refusals. |
| `npm run test:mutation-security:offline` | **0** | 52 offline mutation security assertions passed. |
| `npm run test:session:offline` | **0** | Session issuance, hashing, expiry, disabled-user refusal, and revocation passed. |
| `npm run test:auth-and-session:offline` | **0** | Combined auth-cookie and session checks passed. |
| `npm run migration:plan` | **0** | Offline plan lists only migrations 001–009 and checksums; no database connection. |
| `npm run test:approval:mysql` | **0** | Disposable MariaDB integration: 1 passed, 0 failed, 0 skipped; concurrent decisions, replay, tenant boundaries, and audit immutability. |

Baseline tests ran without DB opt-in. Database assertions were independently enabled and tested against the disposable service below; baseline success was not used to infer database correctness.

Full output logs are retained at `/workspace/.growthos-runtime/logs/`: `test.log`, `typecheck.log`, `test-security-offline.log`, `build.log`, both database guard attempts, other offline script logs, `migration-plan.log`, `server-version.log`, `mariadb-disposable.log`, `approval-mysql.log`, and `npm-test-approval-mysql.log`.

## Disposable MariaDB 11.8

The default sandbox blocked the Docker socket with `operation not permitted`. With supported command-level network permission, the explicit local managed-daemon check succeeded: Docker **28.4.0**. No daemon restart or alternate installation was necessary.

- Pulled `mariadb:11.8`, exit **0**; digest `sha256:c4124d1afa875e47f2892edf26b482fa54f796e2f342d3717a04ca091a22a9bd`.
- Dedicated container: `growthos-cloud-cert-9d813e8`; database files on tmpfs; random test-only passwords; port bound only to `127.0.0.1:33317`.
- Healthcheck: **healthy**. Real SQL query returned **`11.8.9-MariaDB-ubu2404`**, database **`growthos_test_cloud_cert`**, exit **0**.
- Inspected the existing migration runner: it requires explicit disposable opt-in, a test schema name, an empty schema, and loopback transport; it selects exactly 001–009.
- `node scripts/mariadb-migration-runner.cjs --test-disposable` exited **0**. Applied **001–009 only**, plus the ledger. Verified **15 InnoDB tables, 4 audit triggers, 23 foreign-key columns**, migration hashes, and functional audit/FK checks.
- Approval integration passed through the Node runner, then again through the actual `npm run test:approval:mysql` script; both exit **0**.
- Removed the dedicated container with `docker rm --force`, exit **0**. Filtered follow-up listing was empty. Tmpfs data was discarded and local test credential files deleted. Cached image remains available.

**Migrations 010–016 were never executed. Migration files and contracts were not modified. No production database connection or credentials were used.**

## Environment identity and setup execution

Runtime status was checked before and after repair: connected/running, current observations, spec revision **1**, observed spec revision **1**, enforced restricted network policy. No configured secrets, runtime variables, outbound identities, or capabilities were reported.

- Environment ID: `ccarenv_b64_Y2NhcmVudl9lN2FiZjkwOWM4NzA4MTkxYWY2NTAxZTIwNzVlNTRmOA`
- Source configuration ID: `8bc3ea5a-a6e3-4a23-a6d2-fedc765ad180~cecfg_6ae4ad92a6588195a636e6a83b46ec4c`
- Source configuration version ID: `8bc3ea5a-a6e3-4a23-a6d2-fedc765ad180~cecfgver_6ae4c12a26f08195b7101ec5abfca070`

The API exposes no environment display name, setup-script contents, or execution history. **The task's use of the published environment named GrowthOS-Development cannot be confirmed from these tools.** Initial wrong branch, Node 24, and missing dependencies establish absent baseline preparation, not the cause or whether a particular setup hook ran.

No AGENTS.md or cloud startup instructions were found in the checkout; `/workspace/.agents` and `/workspace/.codex` were empty. GitHub Actions requests Node 22 but is not evidence of cloud startup execution. Manual repair succeeded; automatic setup remains **unverified**.

The initial GitHub command could not reach the inherited proxy from the default sandbox. Supported command-level network permission allowed GitHub fetch, Node download, npm installation, and local Docker access. Existing network policy, proxy, and TLS verification were preserved. Network policy reports no VPN or TCP grants. No policy edits or production connectivity probes were made.

## Remaining blockers and development decision

No application defect was established by these checks. Prior missing dependencies and the initial database guard subprocess failure are environment findings, not application defects.

1. **Published identity and startup verification:** reconcile the configuration IDs above with GrowthOS-Development in platform configuration and inspect setup execution history there. Available tools do not expose the display name or permit editing that published hook.
2. **Node persistence:** source the workspace activation file for future commands. A fresh/replaced workspace needs Node 22 and `npm ci` provisioned again; automatic persistence was not certified.
3. **Docker/network access:** use supported command permission mode; the default sandbox cannot reach the managed daemon. The daemon itself works.
4. **Database scope:** certification covers the existing 001–009 baseline and approval integration. The disposable service has been removed. Migrations 010–016 remain unexecuted and uncertified.
5. **Live application validation:** production readiness and authenticated live workflows were not certified. Missing production Supabase/WordPress credentials do not block offline development or the checks above.

**Substantial application development can begin: YES**, on the verified branch with the activated Node 22 runtime and isolated test services. Published environment identity/startup automation remains a separate platform limitation. No deployment, merge, push, paid service activation, production modification, or feature development occurred.
