# Work B persistence proposal — separate review required

This is a proposed additive migration, not an installed migration. Migrations 001–009 and the migration runner are unchanged. Runtime adapters fail closed with a database error until this schema is reviewed, installed in an isolated environment, and certified. All tables use InnoDB and tenant-scoped composite foreign keys. Do not activate publishing or automation with this proposal alone.

```sql
CREATE TABLE growth_content_records (
 organization_id CHAR(36) NOT NULL, website_id CHAR(36) NOT NULL,
 id VARCHAR(128) NOT NULL, version BIGINT UNSIGNED NOT NULL,
 stage VARCHAR(40) NOT NULL, record_json LONGTEXT NOT NULL,
 PRIMARY KEY (organization_id,website_id,id),
 FOREIGN KEY (organization_id,website_id) REFERENCES growth_websites(organization_id,id),
 CHECK (JSON_VALID(record_json))
) ENGINE=InnoDB;
CREATE TABLE growth_content_events (
 organization_id CHAR(36) NOT NULL, website_id CHAR(36) NOT NULL,
 content_id VARCHAR(128) NOT NULL, event_id VARCHAR(128) NOT NULL,
 version BIGINT UNSIGNED NOT NULL,
 PRIMARY KEY (organization_id,website_id,content_id,event_id),
 UNIQUE KEY uq_content_version (organization_id,website_id,content_id,version),
 FOREIGN KEY (organization_id,website_id,content_id)
  REFERENCES growth_content_records(organization_id,website_id,id)
) ENGINE=InnoDB;
CREATE TABLE growth_connector_health (
 organization_id CHAR(36) NOT NULL, website_id CHAR(36) NOT NULL,
 channel VARCHAR(80) NOT NULL, status ENUM('unknown','disconnected','unavailable','verified') NOT NULL DEFAULT 'unknown',
 verified_at DATETIME NULL,
 PRIMARY KEY (organization_id,website_id,channel),
 FOREIGN KEY (organization_id,website_id) REFERENCES growth_websites(organization_id,id)
) ENGINE=InnoDB;
CREATE TABLE growth_publication_claims (
 organization_id CHAR(36) NOT NULL, website_id CHAR(36) NOT NULL,
 content_id VARCHAR(128) NOT NULL, channel VARCHAR(80) NOT NULL,
 claim_hash CHAR(64) NOT NULL, reservation_id CHAR(36) NOT NULL,
 status ENUM('unknown','confirmed','absent') NOT NULL DEFAULT 'unknown',
 provider_id VARCHAR(200) NULL, publication_url VARCHAR(2048) NULL,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY (organization_id,website_id,content_id,channel),
 UNIQUE KEY uq_claim_hash (organization_id,claim_hash),
 FOREIGN KEY (organization_id,website_id,content_id)
  REFERENCES growth_content_records(organization_id,website_id,id),
 FOREIGN KEY (reservation_id) REFERENCES growth_ai_reservations(id)
) ENGINE=InnoDB;
```

Before adoption: verify actual MariaDB 11.8 DDL and permissions; restrict direct UPDATE/DELETE on event and claim tables and enforce immutability through reviewed triggers or write privileges; ensure connector verification is independently attested and expires; require a trusted provider probe, durable observation evidence, and status-to-content reconciliation in one transaction. Current `reconcile` takes a server-side observation argument and cannot itself authenticate provider evidence. A confirmed `absent` claim remains unique and **never grants another outbound attempt**. Publication remains HOLD.

## Quota and settlement proposal

Existing `growth_ai_reservations.week_start` and `month_start` are UTC. Keep `month_start` as UTC portfolio accounting. Add separately reviewed fields `site_week_start DATE`, `site_timezone VARCHAR(80)`, `chargeable_started_at DATETIME(6) NULL`, `reserved_units`, `charged_units`, and a durable settlement/credit journal keyed by reservation and provider charge identifier. Compute the local Monday date with a pinned IANA time-zone implementation at reservation time and store the chosen zone and offset snapshot. Reject unknown/invalid zones and ambiguous boundaries; never fall back silently to UTC. Add an index `(organization_id,website_id,content_type,site_week_start,status)` while retaining `(organization_id,month_start)` for the portfolio budget. Validate and backfill old UTC entries as UTC only, with a documented cutover; do not reinterpret past weeks in another zone.

Section 49 semantics: reserve estimated currency and a concurrency slot atomically; consume the weekly *chargeable execution* allowance only when an actual paid provider request starts. Cancel before dispatch releases reserved units and estimated currency. A failed attempt after dispatch consumes the execution allowance if billable; reconcile actual spend from verified provider settlement, record overruns, and credit only a verified refund with its unique charge identifier. Ambiguous dispatch or payment stays reserved/pending and blocks retry until reconciled. Current certified 001–009 schema counts `reserved` units toward weekly capacity and cannot distinguish dispatch, refunds or site-local weeks. The runtime continues fail-closed for non-UTC sites; no current budget accounting behavior was changed.
