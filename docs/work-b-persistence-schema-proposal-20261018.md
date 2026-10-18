# Work B persistence proposal — separate review required

This is a proposed additive migration, not an installed migration. Migrations 001–009 and the migration runner are unchanged. Runtime adapters fail closed with a database error until this schema is reviewed, installed in an isolated environment, and certified. All tables use InnoDB and tenant-scoped composite foreign keys. Do not activate publishing or automation with this proposal alone.

```sql
CREATE TABLE growth_content_records (
 organization_id CHAR(36) NOT NULL, website_id CHAR(36) NOT NULL,
 id VARCHAR(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL, version BIGINT UNSIGNED NOT NULL,
 stage VARCHAR(40) NOT NULL, record_json LONGTEXT NOT NULL,
 PRIMARY KEY (organization_id,website_id,id),
 FOREIGN KEY (organization_id,website_id) REFERENCES growth_websites(organization_id,id),
 CHECK (JSON_VALID(record_json))
) ENGINE=InnoDB;
CREATE TABLE growth_content_events (
 organization_id CHAR(36) NOT NULL, website_id CHAR(36) NOT NULL,
 content_id VARCHAR(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
 event_id VARCHAR(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
 version BIGINT UNSIGNED NOT NULL, actor_id VARCHAR(128) NOT NULL,
 event_kind VARCHAR(40) NOT NULL, occurred_at DATETIME(6) NOT NULL, record_json LONGTEXT NOT NULL,
 CHECK (JSON_VALID(record_json)),
 PRIMARY KEY (organization_id,website_id,content_id,event_id),
 UNIQUE KEY uq_content_version (organization_id,website_id,content_id,version),
 FOREIGN KEY (organization_id,website_id,content_id)
  REFERENCES growth_content_records(organization_id,website_id,id)
) ENGINE=InnoDB;
CREATE TABLE growth_connector_health (
 organization_id CHAR(36) NOT NULL, website_id CHAR(36) NOT NULL,
 channel VARCHAR(80) NOT NULL, status ENUM('unknown','disconnected','unavailable','verified') NOT NULL DEFAULT 'unknown',
 checked_at DATETIME(6) NOT NULL, expires_at DATETIME(6) NOT NULL,
 CHECK (expires_at > checked_at),
 PRIMARY KEY (organization_id,website_id,channel),
 FOREIGN KEY (organization_id,website_id) REFERENCES growth_websites(organization_id,id)
) ENGINE=InnoDB;
-- Additive index proposal on the certified reservation table; review separately.
ALTER TABLE growth_ai_reservations
 ADD UNIQUE KEY uq_reservation_scope (organization_id,website_id,id);
CREATE TABLE growth_publication_claims (
 organization_id CHAR(36) NOT NULL, website_id CHAR(36) NOT NULL,
 content_id VARCHAR(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL, channel VARCHAR(80) NOT NULL,
 claim_hash CHAR(64) NOT NULL, reservation_id CHAR(36) NOT NULL,
 status ENUM('unknown','confirmed','absent') NOT NULL DEFAULT 'unknown',
 provider_id VARCHAR(200) NULL, publication_url VARCHAR(2048) NULL,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY (organization_id,website_id,content_id,channel),
 UNIQUE KEY uq_claim_hash (organization_id,claim_hash),
 FOREIGN KEY (organization_id,website_id,content_id)
  REFERENCES growth_content_records(organization_id,website_id,id),
 FOREIGN KEY (organization_id,website_id,reservation_id) REFERENCES growth_ai_reservations(organization_id,website_id,id)
) ENGINE=InnoDB;
CREATE TABLE growth_publication_observations (
 organization_id CHAR(36) NOT NULL, website_id CHAR(36) NOT NULL,
 content_id VARCHAR(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL, channel VARCHAR(80) NOT NULL,
 issuer VARCHAR(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
 event_id VARCHAR(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
 payload_hash CHAR(64) NOT NULL, observation_json LONGTEXT NOT NULL,
 PRIMARY KEY (organization_id,issuer,event_id),
 FOREIGN KEY (organization_id,website_id,content_id,channel)
  REFERENCES growth_publication_claims(organization_id,website_id,content_id,channel),
 CHECK (JSON_VALID(observation_json))
) ENGINE=InnoDB;
```

Before adoption: verify actual MariaDB 11.8 DDL and permissions; restrict direct UPDATE/DELETE on event and claim tables and enforce immutability through reviewed triggers or write privileges; ensure connector verification is independently attested and expires; require a trusted provider probe, durable observation evidence, and status-to-content reconciliation in one transaction. Integration now verifies HMAC-signed, expiring, issuer- and tenant/channel-scoped observations against an explicit in-memory trust registry (empty by default), stores observation hashes with replay detection, and commits content status, content audit and claim status in one transaction. No production issuer registry or provider attestation adapter is configured. A confirmed `absent` claim remains unique and **never grants another outbound attempt**. Publication remains HOLD.

## Quota and settlement proposal

Existing `growth_ai_reservations.week_start` and `month_start` are UTC. Keep `month_start` as UTC portfolio accounting. Add separately reviewed fields `site_week_start DATE`, `site_timezone VARCHAR(80)`, `chargeable_started_at DATETIME(6) NULL`, `reserved_units`, `charged_units`, and a durable settlement/credit journal keyed by reservation and provider charge identifier. Compute the local Monday date with a pinned IANA time-zone implementation at reservation time and store the chosen zone and offset snapshot. Reject unknown/invalid zones and ambiguous boundaries; never fall back silently to UTC. Add an index `(organization_id,website_id,content_type,site_week_start,status)` while retaining `(organization_id,month_start)` for the portfolio budget. Validate and backfill old UTC entries as UTC only, with a documented cutover; do not reinterpret past weeks in another zone.

Section 49 semantics: reserve estimated currency and a concurrency slot atomically; consume the weekly *chargeable execution* allowance only when an actual paid provider request starts. Cancel before dispatch releases reserved units and estimated currency. A failed attempt after dispatch consumes the execution allowance if billable; reconcile actual spend from verified provider settlement, record overruns, and credit only a verified refund with its unique charge identifier. Ambiguous dispatch or payment stays reserved/pending and blocks retry until reconciled. Current certified 001–009 schema counts `reserved` units toward weekly capacity and cannot distinguish dispatch, refunds or site-local weeks. The runtime continues fail-closed for non-UTC sites; no current budget accounting behavior was changed.


## Integration schema review decisions

The definitions above are a revised proposal, not executable certification. Content events now retain actor, event kind, occurrence time and the resulting record snapshot. Connector readiness uses `checked_at` and `expires_at`, not an unbounded verification marker. Claim reservation references must include both tenant and website. The existing reservation primary key `id` is globally unique; the proposed composite unique index additionally permits the scoped FK and makes that scope explicit. Its storage/lock impact needs actual MariaDB review. Observations add an append-only replay journal with `(organization_id,issuer,event_id)` uniqueness and a composite claim FK.

Installer must validate the database charset, collation and indexed byte widths. Existing organization/website/reservation FK columns must inherit exactly the certified parent column charset/collation; use binary collation consistently for the proposed case-sensitive content and event identifiers. The largest proposed composite claim key is below InnoDB's 3072-byte index limit with utf8mb4, subject to verification of the actual server page size and row format. The proposal's five new tables would change the certified 15-table inventory to 20; the nine certified migration hashes and four existing audit triggers must remain unchanged. New migration numbering, independent reviewed hashes and certification inventory are separate decisions.

Require reviewed immutability triggers on UPDATE and DELETE for `growth_content_events` and `growth_publication_observations`. Claims must forbid DELETE and any change to organization, website, content, channel, hash, reservation or creation time. Only `unknown -> confirmed|absent` is permitted, with confirmed provider fields non-null and absent provider fields null; terminal records cannot be reset or rewritten. Runtime grants must exclude DELETE and allow only status/provider columns on claims; grant only SELECT/INSERT on event/observation journals. Triggers defend against a mistakenly broader application grant. No trigger or grant was installed here; immutable database enforcement remains BLOCKED pending separate schema approval.

Internal UI approvals (certified tables 006/007) authorize an internal decision only. They do not authorize content publication. A separately reviewed mapping must bind content/version, approver membership, destination and policy approval; no content publisher is wired to the UI's internal approval action. Connector probe writers, issuer trust rotation/revocation, trusted provider outcome verification, and signed evidence retention/redaction policy also remain unresolved. Application HMAC verification is tested only with synthetic issuers. An `absent` claim stays terminal and content remains ambiguous; operator recovery for contradictory/late provider evidence needs its own audited contract and must never reset a one-time claim.
