# GrowthOS trusted connector health — development evidence

Status: **OFFLINE DEVELOPMENT / PRODUCTION HOLD**. No provider connection, publication or automation was activated. Candidate migrations 010–015 remain review-only and uninstalled.

## Reused contracts

The existing `ConnectorTrustService.ingest` already requires a server-side issuer registry, control and attestation signatures, destination identity, explicit capability, bounded freshness, sequence/hash continuity, current database state and an independent non-rollback anchor. `MySQLConnectorEvidenceStore` atomically appends immutable probe history and updates the current pointer and denial projection. Existing tests cover duplicate probes, rollback, revocation, lost commit reply and concurrent ingestion. These contracts were not replaced.

## Added read and administration path

- `ConnectorTrustService.inspectHealth` reads the current independently anchored sequence under the same exclusive issuer/key lease, verifies the stored probe hash and control signature, rechecks the signed attestation against the exact organization, website, channel, destination ID/revision/target and issuer revision, enforces `read` capability and expiry, then rechecks the anchor. It returns the latest successful time only when the **current** trusted observation is verified. Negative observations remain disconnected; historical success is not inferred.
- `/api/organization-connector-health` derives organization from the server session and requires a scoped website. It returns explicit `unknown` when no independently trusted runtime is installed. The production runtime currently returns null by design. If a reviewed runtime is later installed, the route loads the exact destination and returns `unavailable` on verification failure. A disabled destination cannot report verified.
- `/api/organization-connector-history` gives owner/admin a bounded, tenant-scoped view of candidate-011 event metadata only. Claimed status and timestamp are labeled **unverified record**; it does not expose signatures, secrets or probe JSON. It returns service unavailable until the candidate schema is independently installed.
- The first-party Connector panel exposes recorded history and a current trust check. Its website publishing and automation controls only call the existing audited disable-only route. It cannot enable or dispatch anything. The website list continues to report `unknown` without an independently verified result.

## Schema and trust blockers

Candidate 011 already defines `growth_connector_evidence_history`, `growth_connector_attestations`, issuer state, destinations and immutable history/pointer guards. No certified migration file was changed. Its installation, index and trigger behavior and expanded backup inventory require disposable MariaDB 11.8 certification.

There is no production key registry or independent monotonic anchor implementation in this branch. A synthetic test signer is not a production issuer. Website-wide disable switches are available, but a connector-specific irreversible disable requires a **destination-scoped independent fence** checked by every claim path and a separately reviewed append-only disable audit contract. Updating only the ordinary database would allow backup rollback to revive a connector, so no connector-specific mutation route was added.

## Offline evidence and remaining gates

Focused trust tests cover forged signatures, wrong destination/revision, expired evidence, issuer revocation, database rollback/replay, absent anchor, negative signed status and disabled destination. Mocked route tests cover missing session, foreign website, viewer history denial, malformed scope, absence of trust, unverified metadata, disabled destination, verification failure and database outage. These are offline tests, not live MariaDB or production key-custody certification.

Executed with Node.js 24.22.1 and npm 11.9.0 (provisional, not Node 22 parity):

| Command | Exit | Result |
| --- | ---: | --- |
| `npm test` | 0 | 499 tests: 498 passed, one skipped |
| `node --import=tsx --test src/core/__tests__/authorization-trust.test.ts` | 0 | 42 passed after capability check |
| `node scripts/test-connector-health-routes-mocked.cjs` | 0 | 34 mocked route assertions passed |
| `node scripts/test-governance-route-mocked.cjs` | 0 | Governance route checks passed |
| `npm run typecheck` | 0 | Passed after final change |
| `npm run test:security:offline` | 0 | Passed |
| `npm run test:auth-and-session:offline` | 0 | Passed |
| `npm run test:mutation-security:offline` | 0 | 52 assertions passed |
| `npm run test:db-guards:offline` | 0 | Eight refusals passed |
| `npm run migration:plan` | 0 | Plan only; no connection |
| `NEXT_TELEMETRY_DISABLED=1 CIRCLE_NODE_TOTAL=2 npm run build` | 0 | Clean capped production build after final change |

The final focused test and build were rerun after tightening read capability checks. No live MariaDB or provider test ran.

Next: independently review 010–015 and connector grants/backup inventory, provide a durable external anchor and issuer custody, certify real two-session revocation races and read paths on disposable MariaDB 11.8, then run Node 22 parity and authenticated isolated staging. Production remains HOLD / NO-GO.
