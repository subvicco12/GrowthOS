-- REVIEW CANDIDATE ONLY. Not part of database/mysql or the certified installer.
-- Requires MariaDB 11.8, InnoDB 16KiB pages, utf8mb4_uca1400_ai_ci parent IDs.
-- DDL commits implicitly. A partial install must be abandoned, never resumed.
DELIMITER //
-- @statement
CREATE TABLE growth_content_records (
 organization_id CHAR(36) NOT NULL, website_id CHAR(36) NOT NULL,
 id VARCHAR(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
 version BIGINT UNSIGNED NOT NULL,
 stage ENUM('proposed','researched','drafted','review_required','quality_passed','approved','scheduled','publication_unknown','published','attributed','cancelled') NOT NULL,
 record_json LONGTEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
 PRIMARY KEY (organization_id,website_id,id),
 CONSTRAINT fk_content_site FOREIGN KEY (organization_id,website_id) REFERENCES growth_websites(organization_id,id),
 CONSTRAINT ck_content_json CHECK (JSON_VALID(record_json)),
 CONSTRAINT ck_content_scope CHECK (
  JSON_TYPE(JSON_EXTRACT(record_json,'$.organizationId')) = 'STRING' AND JSON_EXTRACT(record_json,'$.organizationId') IS NOT NULL AND
  BINARY JSON_UNQUOTE(JSON_EXTRACT(record_json,'$.organizationId')) = BINARY organization_id AND
  JSON_TYPE(JSON_EXTRACT(record_json,'$.websiteId')) = 'STRING' AND JSON_EXTRACT(record_json,'$.websiteId') IS NOT NULL AND
  BINARY JSON_UNQUOTE(JSON_EXTRACT(record_json,'$.websiteId')) = BINARY website_id AND
  JSON_TYPE(JSON_EXTRACT(record_json,'$.id')) = 'STRING' AND JSON_EXTRACT(record_json,'$.id') IS NOT NULL AND
  BINARY JSON_UNQUOTE(JSON_EXTRACT(record_json,'$.id')) = BINARY id AND
  JSON_TYPE(JSON_EXTRACT(record_json,'$.version')) = 'INTEGER' AND JSON_EXTRACT(record_json,'$.version') IS NOT NULL AND
  JSON_UNQUOTE(JSON_EXTRACT(record_json,'$.version')) = CAST(version AS CHAR) AND
  JSON_TYPE(JSON_EXTRACT(record_json,'$.stage')) = 'STRING' AND JSON_EXTRACT(record_json,'$.stage') IS NOT NULL AND
  BINARY JSON_UNQUOTE(JSON_EXTRACT(record_json,'$.stage')) = BINARY stage AND
  JSON_TYPE(JSON_EXTRACT(record_json,'$.eventIds')) = 'ARRAY' AND JSON_EXTRACT(record_json,'$.eventIds') IS NOT NULL
 )
) ENGINE=InnoDB ROW_FORMAT=DYNAMIC DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci//
-- @statement
CREATE TABLE growth_content_events (
 organization_id CHAR(36) NOT NULL, website_id CHAR(36) NOT NULL,
 content_id VARCHAR(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
 event_id VARCHAR(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
 version BIGINT UNSIGNED NOT NULL, actor_id VARCHAR(128) NOT NULL,
 event_kind VARCHAR(40) NOT NULL, occurred_at DATETIME(6) NOT NULL,
 record_json LONGTEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
 PRIMARY KEY (organization_id,website_id,content_id,event_id),
 UNIQUE KEY uq_content_version (organization_id,website_id,content_id,version),
 CONSTRAINT fk_content_event_record FOREIGN KEY (organization_id,website_id,content_id) REFERENCES growth_content_records(organization_id,website_id,id),
 CONSTRAINT ck_content_event_json CHECK (JSON_VALID(record_json)),
 CONSTRAINT ck_content_event_scope CHECK (
  JSON_EXTRACT(record_json,'$.organizationId') IS NOT NULL AND BINARY JSON_UNQUOTE(JSON_EXTRACT(record_json,'$.organizationId')) = BINARY organization_id AND
  JSON_EXTRACT(record_json,'$.websiteId') IS NOT NULL AND BINARY JSON_UNQUOTE(JSON_EXTRACT(record_json,'$.websiteId')) = BINARY website_id AND
  JSON_EXTRACT(record_json,'$.id') IS NOT NULL AND BINARY JSON_UNQUOTE(JSON_EXTRACT(record_json,'$.id')) = BINARY content_id AND
  JSON_EXTRACT(record_json,'$.version') IS NOT NULL AND JSON_UNQUOTE(JSON_EXTRACT(record_json,'$.version')) = CAST(version AS CHAR)
 )
) ENGINE=InnoDB ROW_FORMAT=DYNAMIC DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci//
-- @statement
CREATE TABLE growth_connector_health (
 organization_id CHAR(36) NOT NULL, website_id CHAR(36) NOT NULL,
 channel VARCHAR(80) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 status ENUM('unknown','disconnected','unavailable','verified') NOT NULL DEFAULT 'unknown',
 checked_at DATETIME(6) NOT NULL, expires_at DATETIME(6) NOT NULL,
 PRIMARY KEY (organization_id,website_id,channel),
 CONSTRAINT fk_connector_site FOREIGN KEY (organization_id,website_id) REFERENCES growth_websites(organization_id,id),
 CONSTRAINT ck_connector_expiry CHECK (expires_at > checked_at)
) ENGINE=InnoDB ROW_FORMAT=DYNAMIC DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci//
-- @statement
ALTER TABLE growth_ai_reservations ADD UNIQUE KEY uq_reservation_scope (organization_id,website_id,id)//
-- @statement
CREATE TABLE growth_publication_claims (
 organization_id CHAR(36) NOT NULL, website_id CHAR(36) NOT NULL,
 content_id VARCHAR(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
 channel VARCHAR(80) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 claim_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL, reservation_id CHAR(36) NOT NULL,
 status ENUM('unknown','confirmed','absent') NOT NULL DEFAULT 'unknown',
 provider_id VARCHAR(200) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NULL,
 publication_url VARCHAR(2048) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NULL,
 created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 PRIMARY KEY (organization_id,website_id,content_id,channel),
 UNIQUE KEY uq_claim_hash (organization_id,claim_hash),
 CONSTRAINT fk_claim_content FOREIGN KEY (organization_id,website_id,content_id) REFERENCES growth_content_records(organization_id,website_id,id),
 CONSTRAINT fk_claim_reservation FOREIGN KEY (organization_id,website_id,reservation_id) REFERENCES growth_ai_reservations(organization_id,website_id,id),
 CONSTRAINT ck_claim_state CHECK (
  (status IN ('unknown','absent') AND provider_id IS NULL AND publication_url IS NULL) OR
  (status = 'confirmed' AND provider_id IS NOT NULL AND CHAR_LENGTH(TRIM(provider_id)) > 0 AND publication_url IS NOT NULL AND publication_url LIKE 'https://%')
 )
) ENGINE=InnoDB ROW_FORMAT=DYNAMIC DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci//
-- @statement
CREATE TABLE growth_publication_observations (
 organization_id CHAR(36) NOT NULL, website_id CHAR(36) NOT NULL,
 content_id VARCHAR(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
 channel VARCHAR(80) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 issuer VARCHAR(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
 event_id VARCHAR(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
 payload_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 observation_json LONGTEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
 PRIMARY KEY (organization_id,issuer,event_id),
 CONSTRAINT fk_observation_claim FOREIGN KEY (organization_id,website_id,content_id,channel) REFERENCES growth_publication_claims(organization_id,website_id,content_id,channel),
 CONSTRAINT ck_observation_json CHECK (JSON_VALID(observation_json)),
 CONSTRAINT ck_observation_scope CHECK (
  JSON_EXTRACT(observation_json,'$.observation.organizationId') IS NOT NULL AND BINARY JSON_UNQUOTE(JSON_EXTRACT(observation_json,'$.observation.organizationId')) = BINARY organization_id AND
  JSON_EXTRACT(observation_json,'$.observation.websiteId') IS NOT NULL AND BINARY JSON_UNQUOTE(JSON_EXTRACT(observation_json,'$.observation.websiteId')) = BINARY website_id AND
  JSON_EXTRACT(observation_json,'$.observation.contentId') IS NOT NULL AND BINARY JSON_UNQUOTE(JSON_EXTRACT(observation_json,'$.observation.contentId')) = BINARY content_id AND
  JSON_EXTRACT(observation_json,'$.observation.channel') IS NOT NULL AND BINARY JSON_UNQUOTE(JSON_EXTRACT(observation_json,'$.observation.channel')) = BINARY channel AND
  JSON_EXTRACT(observation_json,'$.observation.issuer') IS NOT NULL AND BINARY JSON_UNQUOTE(JSON_EXTRACT(observation_json,'$.observation.issuer')) = BINARY issuer AND
  JSON_EXTRACT(observation_json,'$.observation.eventId') IS NOT NULL AND BINARY JSON_UNQUOTE(JSON_EXTRACT(observation_json,'$.observation.eventId')) = BINARY event_id
 )
) ENGINE=InnoDB ROW_FORMAT=DYNAMIC DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci//
-- @statement
CREATE TRIGGER growth_content_events_no_update BEFORE UPDATE ON growth_content_events FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='CONTENT_AUDIT_IMMUTABLE'//
-- @statement
CREATE TRIGGER growth_content_events_no_delete BEFORE DELETE ON growth_content_events FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='CONTENT_AUDIT_IMMUTABLE'//
-- @statement
CREATE TRIGGER growth_publication_observations_no_update BEFORE UPDATE ON growth_publication_observations FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='PUBLICATION_AUDIT_IMMUTABLE'//
-- @statement
CREATE TRIGGER growth_publication_observations_no_delete BEFORE DELETE ON growth_publication_observations FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='PUBLICATION_AUDIT_IMMUTABLE'//
-- @statement
CREATE TRIGGER growth_publication_claim_insert_guard BEFORE INSERT ON growth_publication_claims FOR EACH ROW
BEGIN
 IF NEW.status <> 'unknown' OR NEW.provider_id IS NOT NULL OR NEW.publication_url IS NOT NULL THEN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='CLAIM_MUST_START_UNKNOWN';
 END IF;
END//
-- @statement
CREATE TRIGGER growth_publication_claim_update_guard BEFORE UPDATE ON growth_publication_claims FOR EACH ROW
BEGIN
 IF NOT (BINARY NEW.organization_id <=> BINARY OLD.organization_id) OR NOT (BINARY NEW.website_id <=> BINARY OLD.website_id) OR
    NOT (BINARY NEW.content_id <=> BINARY OLD.content_id) OR NOT (BINARY NEW.channel <=> BINARY OLD.channel) OR
    NOT (BINARY NEW.claim_hash <=> BINARY OLD.claim_hash) OR NOT (BINARY NEW.reservation_id <=> BINARY OLD.reservation_id) OR
    NOT (NEW.created_at <=> OLD.created_at) THEN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='CLAIM_IDENTITY_IMMUTABLE';
 END IF;
 IF OLD.status <> 'unknown' OR NEW.status NOT IN ('confirmed','absent') THEN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='CLAIM_TERMINAL_STATE_IMMUTABLE';
 END IF;
END//
-- @statement
CREATE TRIGGER growth_publication_claim_no_delete BEFORE DELETE ON growth_publication_claims FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='CLAIM_IDENTITY_IMMUTABLE'//
DELIMITER ;
