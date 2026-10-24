-- REVIEW CANDIDATE ONLY. Requires certified 001-014 and empty candidate tables.
-- Do not register with the production migration runner or install outside disposable schemas.
-- Inherit database charset/collation so composite UUID foreign keys match growth_websites.
CREATE TABLE growth_intelligence_evidence (
 id CHAR(36) NOT NULL PRIMARY KEY,
 organization_id CHAR(36) NOT NULL, website_id CHAR(36) NOT NULL,
 idempotency_key VARCHAR(128) NOT NULL,
 actor_id CHAR(36) NOT NULL,
 source_kind ENUM('manual') NOT NULL,
 source_label VARCHAR(200) NOT NULL,
 observed_at DATETIME(6) NOT NULL,
 ingested_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 expires_at DATETIME(6) NOT NULL,
 payload_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 payload_json JSON NOT NULL,
 verification_status ENUM('unverified') NOT NULL DEFAULT 'unverified',
 UNIQUE KEY uq_intelligence_request (organization_id,website_id,idempotency_key),
 UNIQUE KEY uq_intelligence_scope (organization_id,website_id,id),
 KEY idx_intelligence_page (organization_id,website_id,ingested_at,id),
 FOREIGN KEY (organization_id,website_id) REFERENCES growth_websites(organization_id,id),
 FOREIGN KEY (actor_id) REFERENCES growth_users(id),
 CHECK (expires_at > observed_at)
) ENGINE=InnoDB;
CREATE TABLE growth_intelligence_evidence_events (
 id CHAR(36) NOT NULL PRIMARY KEY,
 organization_id CHAR(36) NOT NULL, website_id CHAR(36) NOT NULL,
 evidence_id CHAR(36) NOT NULL, actor_id CHAR(36) NOT NULL,
 event_type ENUM('ingested','revoked') NOT NULL,
 recorded_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 UNIQUE KEY uq_intelligence_event (evidence_id,event_type),
 KEY idx_intelligence_events (organization_id,website_id,recorded_at,id),
 FOREIGN KEY (organization_id,website_id,evidence_id) REFERENCES growth_intelligence_evidence(organization_id,website_id,id),
 FOREIGN KEY (actor_id) REFERENCES growth_users(id)
) ENGINE=InnoDB;
CREATE TRIGGER intelligence_evidence_no_update BEFORE UPDATE ON growth_intelligence_evidence
 FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='IMMUTABLE_INTELLIGENCE_EVIDENCE';
CREATE TRIGGER intelligence_evidence_no_delete BEFORE DELETE ON growth_intelligence_evidence
 FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='IMMUTABLE_INTELLIGENCE_EVIDENCE';
CREATE TRIGGER intelligence_events_no_update BEFORE UPDATE ON growth_intelligence_evidence_events
 FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='IMMUTABLE_INTELLIGENCE_EVENT';
CREATE TRIGGER intelligence_events_no_delete BEFORE DELETE ON growth_intelligence_evidence_events
 FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='IMMUTABLE_INTELLIGENCE_EVENT';

-- Plan rows are issued only by a separately authorized plan issuer. No payment webhook writes here.
CREATE TABLE growth_plan_assignments (
 organization_id CHAR(36) NOT NULL PRIMARY KEY,
 plan ENUM('free','pro','business') NOT NULL,
 revision BIGINT UNSIGNED NOT NULL,
 issuer VARCHAR(128) NOT NULL,
 evidence_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 expires_at DATETIME(6) NOT NULL,
 revoked_at DATETIME(6) NULL,
 FOREIGN KEY (organization_id) REFERENCES growth_organizations(id),
 CHECK (revision > 0)
) ENGINE=InnoDB;
CREATE TABLE growth_plan_assignment_events (
 id CHAR(36) NOT NULL PRIMARY KEY,
 organization_id CHAR(36) NOT NULL, revision BIGINT UNSIGNED NOT NULL,
 plan ENUM('free','pro','business') NOT NULL,
 action ENUM('issued','revoked','expired') NOT NULL,
 issuer VARCHAR(128) NOT NULL,
 evidence_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 recorded_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 UNIQUE KEY uq_plan_revision_action (organization_id,revision,action),
 FOREIGN KEY (organization_id) REFERENCES growth_organizations(id)
) ENGINE=InnoDB;
CREATE TRIGGER plan_assignment_events_no_update BEFORE UPDATE ON growth_plan_assignment_events
 FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='IMMUTABLE_PLAN_EVENT';
CREATE TRIGGER plan_assignment_events_no_delete BEFORE DELETE ON growth_plan_assignment_events
 FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='IMMUTABLE_PLAN_EVENT';
CREATE TABLE growth_plan_usage (
 organization_id CHAR(36) NOT NULL, feature_key VARCHAR(80) NOT NULL,
 period_start DATE NOT NULL, reserved_units BIGINT UNSIGNED NOT NULL DEFAULT 0,
 consumed_units BIGINT UNSIGNED NOT NULL DEFAULT 0,
 PRIMARY KEY (organization_id,feature_key,period_start),
 FOREIGN KEY (organization_id) REFERENCES growth_organizations(id)
) ENGINE=InnoDB;
CREATE TABLE growth_plan_usage_events (
 id CHAR(36) NOT NULL PRIMARY KEY,
 organization_id CHAR(36) NOT NULL, feature_key VARCHAR(80) NOT NULL,
 period_start DATE NOT NULL, idempotency_key VARCHAR(128) NOT NULL,
 units BIGINT UNSIGNED NOT NULL,
 status ENUM('reserved','settled','released') NOT NULL,
 plan_revision BIGINT UNSIGNED NOT NULL,
 recorded_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 UNIQUE KEY uq_plan_usage_request (organization_id,feature_key,idempotency_key),
 UNIQUE KEY uq_plan_usage_event_scope (organization_id,id),
 KEY idx_plan_usage_period (organization_id,feature_key,period_start,status),
 FOREIGN KEY (organization_id,feature_key,period_start) REFERENCES growth_plan_usage(organization_id,feature_key,period_start),
 CHECK (units > 0)
) ENGINE=InnoDB;
CREATE TABLE growth_plan_usage_transitions (
 id CHAR(36) NOT NULL PRIMARY KEY,
 organization_id CHAR(36) NOT NULL, usage_event_id CHAR(36) NOT NULL,
 action ENUM('reserved','settled','released') NOT NULL,
 recorded_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 UNIQUE KEY uq_usage_transition (usage_event_id,action),
 FOREIGN KEY (organization_id,usage_event_id) REFERENCES growth_plan_usage_events(organization_id,id)
) ENGINE=InnoDB;
CREATE TRIGGER plan_usage_transitions_no_update BEFORE UPDATE ON growth_plan_usage_transitions
 FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='IMMUTABLE_USAGE_TRANSITION';
CREATE TRIGGER plan_usage_transitions_no_delete BEFORE DELETE ON growth_plan_usage_transitions
 FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='IMMUTABLE_USAGE_TRANSITION';
