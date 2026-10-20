-- REVIEW ONLY: proposed 012 after pinned 010 and 011; no installation authorization.
-- DDL implicitly commits. Abandon partial schemas; never resume or reset.
DELIMITER //
-- @statement
CREATE TABLE growth_quota_reservations_v2 (
 organization_id CHAR(36) NOT NULL, website_id CHAR(36) NOT NULL, id VARCHAR(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
 content_id VARCHAR(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NULL, request_key VARCHAR(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
 content_type VARCHAR(40) NOT NULL, operation ENUM('generation','publication') NOT NULL, currency CHAR(3) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 timezone_name VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL, timezone_rules VARCHAR(80) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 local_week DATE NOT NULL, week_start_utc DATETIME(6) NOT NULL, week_end_utc DATETIME(6) NOT NULL, portfolio_month DATE NOT NULL,
 reserved_units BIGINT UNSIGNED NOT NULL, charged_units BIGINT UNSIGNED NOT NULL DEFAULT 0,
 estimated_minor BIGINT UNSIGNED NOT NULL, charged_minor BIGINT UNSIGNED NOT NULL DEFAULT 0, refunded_minor BIGINT UNSIGNED NOT NULL DEFAULT 0,
 version BIGINT UNSIGNED NOT NULL, state ENUM('reserved','executing','completed','failed','cancelled','expired') NOT NULL DEFAULT 'reserved',
 expires_at DATETIME(6) NOT NULL, started_at DATETIME(6) NULL, settled_at DATETIME(6) NULL,
 reservation_json LONGTEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
 PRIMARY KEY (organization_id,website_id,id), UNIQUE KEY uq_quota_request (organization_id,request_key), UNIQUE KEY uq_quota_currency_month (organization_id,website_id,id,currency,portfolio_month),
 KEY idx_quota_week (organization_id,website_id,content_type,week_start_utc,state), KEY idx_quota_month (organization_id,portfolio_month,currency,state),
 KEY fk_quota_content_idx (organization_id,website_id,content_id),
 KEY fk_quota_policy_idx (website_id,content_type),
 CONSTRAINT fk_quota_site FOREIGN KEY (organization_id,website_id) REFERENCES growth_websites(organization_id,id),
 CONSTRAINT fk_quota_policy FOREIGN KEY (website_id,content_type) REFERENCES growth_content_policies(website_id,content_type),
 CONSTRAINT fk_quota_content FOREIGN KEY (organization_id,website_id,content_id) REFERENCES growth_content_records(organization_id,website_id,id),
 CHECK (JSON_VALID(reservation_json)), CHECK (version<=9007199254740991), CHECK (operation<>'publication' OR content_id IS NOT NULL),
 CHECK (reserved_units>0 AND reserved_units<=9007199254740991 AND charged_units<=reserved_units),
 CHECK (week_end_utc>week_start_utc AND DAYOFWEEK(local_week)=2 AND DAYOFMONTH(portfolio_month)=1),
 CHECK (refunded_minor<=charged_minor), CHECK ((state IN ('reserved','cancelled','expired') AND started_at IS NULL AND charged_units=0) OR (state IN ('executing','completed','failed') AND started_at IS NOT NULL AND charged_units=reserved_units)),
 CHECK (settled_at IS NULL OR state IN ('completed','failed')),
 CHECK (BINARY JSON_UNQUOTE(JSON_EXTRACT(reservation_json,'$.organizationId'))=BINARY organization_id AND JSON_EXTRACT(reservation_json,'$.organizationId') IS NOT NULL AND BINARY JSON_UNQUOTE(JSON_EXTRACT(reservation_json,'$.websiteId'))=BINARY website_id AND JSON_EXTRACT(reservation_json,'$.websiteId') IS NOT NULL AND BINARY JSON_UNQUOTE(JSON_EXTRACT(reservation_json,'$.id'))=BINARY id AND JSON_EXTRACT(reservation_json,'$.id') IS NOT NULL)
) ENGINE=InnoDB ROW_FORMAT=DYNAMIC DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci//
-- @statement
CREATE TABLE growth_quota_events_v2 (
 organization_id CHAR(36) NOT NULL, website_id CHAR(36) NOT NULL, reservation_id VARCHAR(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL, request_key VARCHAR(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
 expected_version BIGINT UNSIGNED NOT NULL, resulting_version BIGINT UNSIGNED NOT NULL,
 operation ENUM('reserve','start','complete','fail','cancel','expire','charge','refund','settle') NOT NULL,
 occurred_at DATETIME(6) NOT NULL, actor_kind ENUM('user','service') NOT NULL, actor_id CHAR(36) NULL, service_id VARCHAR(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NULL,
 authorization_revision VARCHAR(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL, policy_revision VARCHAR(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL, authorized_at DATETIME(6) NOT NULL, authorization_expires_at DATETIME(6) NOT NULL, payload_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 event_json LONGTEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
 PRIMARY KEY (organization_id,request_key), UNIQUE KEY uq_quota_event_version (organization_id,website_id,reservation_id,resulting_version),
 KEY fk_quota_event_actor_idx (actor_id),
 CONSTRAINT fk_quota_event_reservation FOREIGN KEY (organization_id,website_id,reservation_id) REFERENCES growth_quota_reservations_v2(organization_id,website_id,id),
 CONSTRAINT fk_quota_event_actor FOREIGN KEY (actor_id) REFERENCES growth_users(id),
 CHECK ((actor_kind='user' AND actor_id IS NOT NULL AND service_id IS NULL) OR (actor_kind='service' AND actor_id IS NULL AND service_id IS NOT NULL)), CHECK (authorized_at<=occurred_at AND occurred_at<authorization_expires_at AND authorization_expires_at<=authorized_at+INTERVAL 5 MINUTE), CHECK (JSON_VALID(event_json)), CHECK (((operation='reserve' AND expected_version=0 AND resulting_version=0) OR (operation<>'reserve' AND resulting_version=expected_version+1)) AND resulting_version<=9007199254740991)
) ENGINE=InnoDB ROW_FORMAT=DYNAMIC DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci//
-- @statement
CREATE TABLE growth_quota_postings_v2 (
 organization_id CHAR(36) NOT NULL, website_id CHAR(36) NOT NULL, reservation_id VARCHAR(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL, id VARCHAR(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
 issuer VARCHAR(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL, account_id VARCHAR(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL, provider_event_id VARCHAR(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
 kind ENUM('charge','refund','settlement') NOT NULL, original_charge_id VARCHAR(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NULL,
 currency CHAR(3) CHARACTER SET ascii COLLATE ascii_bin NOT NULL, portfolio_month DATE NOT NULL, amount_minor BIGINT UNSIGNED NOT NULL,
 occurred_at DATETIME(6) NOT NULL, verified_at DATETIME(6) NOT NULL, key_revision VARCHAR(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL, payload_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 evidence_json LONGTEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
 PRIMARY KEY (organization_id,website_id,id), UNIQUE KEY uq_quota_charge_scope (organization_id,website_id,reservation_id,id,currency,portfolio_month), UNIQUE KEY uq_quota_provider_event (issuer,account_id,provider_event_id),
 KEY fk_quota_posting_reservation_idx (organization_id,website_id,reservation_id,currency,portfolio_month), KEY fk_quota_original_charge_idx (organization_id,website_id,reservation_id,original_charge_id,currency,portfolio_month),
 CONSTRAINT fk_quota_posting_reservation FOREIGN KEY (organization_id,website_id,reservation_id,currency,portfolio_month) REFERENCES growth_quota_reservations_v2(organization_id,website_id,id,currency,portfolio_month),
 CONSTRAINT fk_quota_original_charge FOREIGN KEY (organization_id,website_id,reservation_id,original_charge_id,currency,portfolio_month) REFERENCES growth_quota_postings_v2(organization_id,website_id,reservation_id,id,currency,portfolio_month),
 CHECK (JSON_VALID(evidence_json)), CHECK (DAYOFMONTH(portfolio_month)=1), CHECK ((kind='refund' AND original_charge_id IS NOT NULL) OR (kind<>'refund' AND original_charge_id IS NULL))
) ENGINE=InnoDB ROW_FORMAT=DYNAMIC DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci//
-- @statement
CREATE TRIGGER growth_quota_events_update BEFORE UPDATE ON growth_quota_events_v2 FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='QUOTA_JOURNAL_IMMUTABLE'//
-- @statement
CREATE TRIGGER growth_quota_events_delete BEFORE DELETE ON growth_quota_events_v2 FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='QUOTA_JOURNAL_IMMUTABLE'//
-- @statement
CREATE TRIGGER growth_quota_postings_update BEFORE UPDATE ON growth_quota_postings_v2 FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='QUOTA_JOURNAL_IMMUTABLE'//
-- @statement
CREATE TRIGGER growth_quota_postings_delete BEFORE DELETE ON growth_quota_postings_v2 FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='QUOTA_JOURNAL_IMMUTABLE'//
-- @statement
CREATE TRIGGER growth_quota_insert_guard BEFORE INSERT ON growth_quota_reservations_v2 FOR EACH ROW BEGIN IF NEW.state<>'reserved' OR NEW.version<>0 OR NEW.charged_minor<>0 OR NEW.refunded_minor<>0 OR NEW.started_at IS NOT NULL OR NEW.settled_at IS NOT NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='QUOTA_MUST_START_RESERVED'; END IF; END//
-- @statement
CREATE TRIGGER growth_quota_update_guard BEFORE UPDATE ON growth_quota_reservations_v2 FOR EACH ROW BEGIN IF NOT (BINARY NEW.organization_id <=> BINARY OLD.organization_id) OR NOT (BINARY NEW.website_id <=> BINARY OLD.website_id) OR NOT (BINARY NEW.id <=> BINARY OLD.id) OR NOT (BINARY NEW.content_id <=> BINARY OLD.content_id) OR NOT (BINARY NEW.request_key <=> BINARY OLD.request_key) OR NOT (BINARY NEW.content_type <=> BINARY OLD.content_type) OR NOT (BINARY NEW.operation <=> BINARY OLD.operation) OR NOT (BINARY NEW.currency <=> BINARY OLD.currency) OR NOT (BINARY NEW.timezone_name <=> BINARY OLD.timezone_name) OR NOT (BINARY NEW.timezone_rules <=> BINARY OLD.timezone_rules) OR NOT (BINARY NEW.local_week <=> BINARY OLD.local_week) OR NOT (BINARY NEW.week_start_utc <=> BINARY OLD.week_start_utc) OR NOT (BINARY NEW.week_end_utc <=> BINARY OLD.week_end_utc) OR NOT (BINARY NEW.portfolio_month <=> BINARY OLD.portfolio_month) OR NOT (BINARY NEW.reserved_units <=> BINARY OLD.reserved_units) OR NOT (BINARY NEW.estimated_minor <=> BINARY OLD.estimated_minor) OR NOT (BINARY NEW.expires_at <=> BINARY OLD.expires_at) OR NOT (BINARY NEW.reservation_json <=> BINARY OLD.reservation_json) OR NEW.version<>OLD.version+1 OR (OLD.settled_at IS NOT NULL AND (NOT (NEW.settled_at <=> OLD.settled_at) OR NEW.state<>OLD.state OR NEW.charged_minor<>OLD.charged_minor OR NEW.refunded_minor<=OLD.refunded_minor)) OR OLD.state IN ('cancelled','expired') OR NEW.charged_units<OLD.charged_units OR NEW.charged_minor<OLD.charged_minor OR NEW.refunded_minor<OLD.refunded_minor OR (OLD.started_at IS NOT NULL AND NOT (NEW.started_at <=> OLD.started_at)) OR NOT ((OLD.state='reserved' AND NEW.state IN ('executing','cancelled','expired')) OR (OLD.state='executing' AND NEW.state IN ('executing','completed','failed')) OR (OLD.state IN ('completed','failed') AND NEW.state=OLD.state)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='QUOTA_IDENTITY_OR_TRANSITION_INVALID'; END IF; END//
-- @statement
CREATE TRIGGER growth_quota_no_delete BEFORE DELETE ON growth_quota_reservations_v2 FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='QUOTA_IDENTITY_IMMUTABLE'//
DELIMITER ;
