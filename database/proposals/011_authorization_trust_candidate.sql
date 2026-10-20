-- REVIEW ONLY: additive 011, requires pinned candidate 010; NOT in the certified installer.
-- MariaDB 11.8, 16KiB InnoDB pages, exact 010 collations. Never execute outside an approved disposable certification.
-- DDL implicitly commits: partial install is abandoned, never resumed. No ledger row is written here.
DELIMITER //
-- @statement
CREATE TABLE growth_publication_policy_revisions (
 organization_id CHAR(36) NOT NULL, website_id CHAR(36) NOT NULL,
 content_type VARCHAR(40) NOT NULL, revision VARCHAR(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL, revision_number BIGINT UNSIGNED NOT NULL DEFAULT 1,
 feature_enabled BOOLEAN NOT NULL DEFAULT FALSE,
 PRIMARY KEY (organization_id,website_id,content_type),
 CONSTRAINT fk_auth_policy_site FOREIGN KEY (organization_id,website_id) REFERENCES growth_websites(organization_id,id),
 KEY fk_auth_policy_type_idx (website_id,content_type),
 CONSTRAINT fk_auth_policy_type FOREIGN KEY (website_id,content_type) REFERENCES growth_content_policies(website_id,content_type)

) ENGINE=InnoDB ROW_FORMAT=DYNAMIC DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci//

-- @statement
CREATE TABLE growth_publication_destinations (
 organization_id CHAR(36) NOT NULL, website_id CHAR(36) NOT NULL,
 id VARCHAR(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL, channel VARCHAR(80) CHARACTER SET ascii COLLATE ascii_bin NOT NULL, revision VARCHAR(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL, revision_number BIGINT UNSIGNED NOT NULL DEFAULT 1,
 target VARCHAR(2048) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL, enabled BOOLEAN NOT NULL DEFAULT FALSE,
 PRIMARY KEY (organization_id,website_id,id), UNIQUE KEY uq_auth_destination_channel (organization_id,website_id,channel,id),
 CONSTRAINT fk_auth_destination_site FOREIGN KEY (organization_id,website_id) REFERENCES growth_websites(organization_id,id)

) ENGINE=InnoDB ROW_FORMAT=DYNAMIC DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci//

-- @statement
CREATE TABLE growth_connector_issuer_state (

 issuer VARCHAR(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL, key_id VARCHAR(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL, revision VARCHAR(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
 generation BIGINT UNSIGNED NOT NULL, revoked BOOLEAN NOT NULL DEFAULT TRUE,
 PRIMARY KEY (issuer,key_id), CHECK (generation <= 9007199254740991)

) ENGINE=InnoDB ROW_FORMAT=DYNAMIC DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci//

-- @statement
CREATE TABLE growth_connector_evidence_history (
 organization_id CHAR(36) NOT NULL, website_id CHAR(36) NOT NULL,
 issuer VARCHAR(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL, key_id VARCHAR(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL, event_id VARCHAR(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
 channel VARCHAR(80) CHARACTER SET ascii COLLATE ascii_bin NOT NULL, destination_id VARCHAR(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL, sequence BIGINT UNSIGNED NOT NULL,
 previous_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL, payload_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL, probe_json LONGTEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
 PRIMARY KEY (issuer,key_id,event_id), UNIQUE KEY uq_probe_sequence (issuer,key_id,sequence),
 UNIQUE KEY uq_probe_hash (issuer,key_id,event_id,payload_hash),
 KEY fk_probe_destination_idx (organization_id,website_id,channel,destination_id),
 CONSTRAINT fk_probe_destination FOREIGN KEY (organization_id,website_id,channel,destination_id) REFERENCES growth_publication_destinations(organization_id,website_id,channel,id),
 CONSTRAINT fk_probe_issuer FOREIGN KEY (issuer,key_id) REFERENCES growth_connector_issuer_state(issuer,key_id),
 CHECK (sequence > 0 AND sequence <= 9007199254740991), CHECK (JSON_VALID(probe_json)),
 CHECK (JSON_EXTRACT(probe_json,'$.attestation.evidence.organizationId') IS NOT NULL AND BINARY JSON_UNQUOTE(JSON_EXTRACT(probe_json,'$.attestation.evidence.organizationId'))=BINARY organization_id AND JSON_EXTRACT(probe_json,'$.attestation.evidence.websiteId') IS NOT NULL AND BINARY JSON_UNQUOTE(JSON_EXTRACT(probe_json,'$.attestation.evidence.websiteId'))=BINARY website_id AND JSON_EXTRACT(probe_json,'$.attestation.evidence.issuer') IS NOT NULL AND BINARY JSON_UNQUOTE(JSON_EXTRACT(probe_json,'$.attestation.evidence.issuer'))=BINARY issuer AND JSON_EXTRACT(probe_json,'$.attestation.evidence.keyId') IS NOT NULL AND BINARY JSON_UNQUOTE(JSON_EXTRACT(probe_json,'$.attestation.evidence.keyId'))=BINARY key_id AND JSON_EXTRACT(probe_json,'$.attestation.evidence.eventId') IS NOT NULL AND BINARY JSON_UNQUOTE(JSON_EXTRACT(probe_json,'$.attestation.evidence.eventId'))=BINARY event_id AND JSON_EXTRACT(probe_json,'$.attestation.evidence.channel') IS NOT NULL AND BINARY JSON_UNQUOTE(JSON_EXTRACT(probe_json,'$.attestation.evidence.channel'))=BINARY channel AND JSON_EXTRACT(probe_json,'$.attestation.evidence.destinationId') IS NOT NULL AND BINARY JSON_UNQUOTE(JSON_EXTRACT(probe_json,'$.attestation.evidence.destinationId'))=BINARY destination_id)

) ENGINE=InnoDB ROW_FORMAT=DYNAMIC DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci//

-- @statement
CREATE TABLE growth_connector_attestations (
 organization_id CHAR(36) NOT NULL, website_id CHAR(36) NOT NULL,
 channel VARCHAR(80) CHARACTER SET ascii COLLATE ascii_bin NOT NULL, destination_id VARCHAR(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL, issuer VARCHAR(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL, key_id VARCHAR(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL, event_id VARCHAR(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
 sequence BIGINT UNSIGNED NOT NULL, payload_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL, signed_json LONGTEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL, revoked_at DATETIME(6) NULL,
 PRIMARY KEY (organization_id,website_id,channel,destination_id), UNIQUE KEY uq_current_issuer_key (issuer,key_id),
 CONSTRAINT fk_attest_destination FOREIGN KEY (organization_id,website_id,channel,destination_id) REFERENCES growth_publication_destinations(organization_id,website_id,channel,id),
 KEY fk_attest_history_idx (issuer,key_id,event_id),
 CONSTRAINT fk_attest_history FOREIGN KEY (issuer,key_id,event_id) REFERENCES growth_connector_evidence_history(issuer,key_id,event_id),
 CHECK (JSON_VALID(signed_json)), CHECK (JSON_EXTRACT(signed_json,'$.evidence.organizationId') IS NOT NULL AND BINARY JSON_UNQUOTE(JSON_EXTRACT(signed_json,'$.evidence.organizationId'))=BINARY organization_id AND JSON_EXTRACT(signed_json,'$.evidence.websiteId') IS NOT NULL AND BINARY JSON_UNQUOTE(JSON_EXTRACT(signed_json,'$.evidence.websiteId'))=BINARY website_id AND JSON_EXTRACT(signed_json,'$.evidence.channel') IS NOT NULL AND BINARY JSON_UNQUOTE(JSON_EXTRACT(signed_json,'$.evidence.channel'))=BINARY channel AND JSON_EXTRACT(signed_json,'$.evidence.destinationId') IS NOT NULL AND BINARY JSON_UNQUOTE(JSON_EXTRACT(signed_json,'$.evidence.destinationId'))=BINARY destination_id AND JSON_EXTRACT(signed_json,'$.evidence.issuer') IS NOT NULL AND BINARY JSON_UNQUOTE(JSON_EXTRACT(signed_json,'$.evidence.issuer'))=BINARY issuer AND JSON_EXTRACT(signed_json,'$.evidence.keyId') IS NOT NULL AND BINARY JSON_UNQUOTE(JSON_EXTRACT(signed_json,'$.evidence.keyId'))=BINARY key_id AND JSON_EXTRACT(signed_json,'$.evidence.eventId') IS NOT NULL AND BINARY JSON_UNQUOTE(JSON_EXTRACT(signed_json,'$.evidence.eventId'))=BINARY event_id)

) ENGINE=InnoDB ROW_FORMAT=DYNAMIC DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci//

-- @statement
CREATE TABLE growth_content_authorizations (
 organization_id CHAR(36) NOT NULL, website_id CHAR(36) NOT NULL,
 id VARCHAR(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL, content_id VARCHAR(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL, content_version BIGINT UNSIGNED NOT NULL, channel VARCHAR(80) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 approval_event_id VARCHAR(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL, reservation_id CHAR(36) NOT NULL, destination_id VARCHAR(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL, approver_id CHAR(36) NOT NULL,
 authorization_json LONGTEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL, revoked_at DATETIME(6) NULL, consumed_at DATETIME(6) NULL, claim_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
 PRIMARY KEY (organization_id,website_id,id),
 UNIQUE KEY uq_single_content_approval (organization_id,website_id,content_id,approval_event_id,channel),
 UNIQUE KEY uq_auth_source_scope (organization_id,website_id,id,content_id,approval_event_id,destination_id),
 UNIQUE KEY uq_auth_claim_scope (organization_id,website_id,id,claim_hash),
 CONSTRAINT fk_auth_content FOREIGN KEY (organization_id,website_id,content_id) REFERENCES growth_content_records(organization_id,website_id,id),
 CONSTRAINT fk_auth_approval_event FOREIGN KEY (organization_id,website_id,content_id,approval_event_id) REFERENCES growth_content_events(organization_id,website_id,content_id,event_id),
 KEY fk_auth_reservation_idx (organization_id,website_id,reservation_id),
 CONSTRAINT fk_auth_reservation FOREIGN KEY (organization_id,website_id,reservation_id) REFERENCES growth_ai_reservations(organization_id,website_id,id),
 KEY fk_auth_destination_idx (organization_id,website_id,destination_id),
 CONSTRAINT fk_auth_destination FOREIGN KEY (organization_id,website_id,destination_id) REFERENCES growth_publication_destinations(organization_id,website_id,id),
 KEY fk_auth_approver_idx (approver_id),
 CONSTRAINT fk_auth_approver FOREIGN KEY (approver_id) REFERENCES growth_users(id),
 KEY fk_auth_claim_idx (organization_id,claim_hash),
 CONSTRAINT fk_auth_claim FOREIGN KEY (organization_id,claim_hash) REFERENCES growth_publication_claims(organization_id,claim_hash),
 CHECK (JSON_VALID(authorization_json)), CHECK (content_version <= 9007199254740991),
 CHECK ((consumed_at IS NULL AND claim_hash IS NULL) OR (consumed_at IS NOT NULL AND claim_hash=SHA2(CONCAT('publish:',organization_id,':',website_id,':',content_id,':',channel),256))),
 CHECK (NOT (revoked_at IS NOT NULL AND consumed_at IS NOT NULL)),
 CHECK (JSON_EXTRACT(authorization_json,'$.organizationId') IS NOT NULL AND BINARY JSON_UNQUOTE(JSON_EXTRACT(authorization_json,'$.organizationId'))=BINARY organization_id AND JSON_EXTRACT(authorization_json,'$.websiteId') IS NOT NULL AND BINARY JSON_UNQUOTE(JSON_EXTRACT(authorization_json,'$.websiteId'))=BINARY website_id AND JSON_EXTRACT(authorization_json,'$.id') IS NOT NULL AND BINARY JSON_UNQUOTE(JSON_EXTRACT(authorization_json,'$.id'))=BINARY id AND JSON_EXTRACT(authorization_json,'$.contentId') IS NOT NULL AND BINARY JSON_UNQUOTE(JSON_EXTRACT(authorization_json,'$.contentId'))=BINARY content_id AND JSON_EXTRACT(authorization_json,'$.contentVersion') IS NOT NULL AND BINARY JSON_UNQUOTE(JSON_EXTRACT(authorization_json,'$.contentVersion'))=BINARY content_version AND JSON_EXTRACT(authorization_json,'$.channel') IS NOT NULL AND BINARY JSON_UNQUOTE(JSON_EXTRACT(authorization_json,'$.channel'))=BINARY channel AND JSON_EXTRACT(authorization_json,'$.approvalDecisionId') IS NOT NULL AND BINARY JSON_UNQUOTE(JSON_EXTRACT(authorization_json,'$.approvalDecisionId'))=BINARY approval_event_id AND JSON_EXTRACT(authorization_json,'$.reservationId') IS NOT NULL AND BINARY JSON_UNQUOTE(JSON_EXTRACT(authorization_json,'$.reservationId'))=BINARY reservation_id AND JSON_EXTRACT(authorization_json,'$.destinationId') IS NOT NULL AND BINARY JSON_UNQUOTE(JSON_EXTRACT(authorization_json,'$.destinationId'))=BINARY destination_id AND JSON_EXTRACT(authorization_json,'$.approverId') IS NOT NULL AND BINARY JSON_UNQUOTE(JSON_EXTRACT(authorization_json,'$.approverId'))=BINARY approver_id)

) ENGINE=InnoDB ROW_FORMAT=DYNAMIC DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci//

-- @statement
CREATE TABLE growth_publication_authorization_events (
 organization_id CHAR(36) NOT NULL, website_id CHAR(36) NOT NULL,
 authorization_id VARCHAR(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL, request_key VARCHAR(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL, actor_id CHAR(36) NOT NULL,
 operation ENUM('issue','revoke') NOT NULL, occurred_at DATETIME(6) NOT NULL, authorization_json LONGTEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
 PRIMARY KEY (organization_id,request_key), KEY idx_auth_event_scope (organization_id,website_id,authorization_id,occurred_at),
 CONSTRAINT fk_auth_event_authorization FOREIGN KEY (organization_id,website_id,authorization_id) REFERENCES growth_content_authorizations(organization_id,website_id,id),
 KEY fk_auth_event_actor_idx (actor_id),
 CONSTRAINT fk_auth_event_actor FOREIGN KEY (actor_id) REFERENCES growth_users(id), CHECK (JSON_VALID(authorization_json))

) ENGINE=InnoDB ROW_FORMAT=DYNAMIC DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci//

-- @statement
CREATE TABLE growth_publication_authorization_uses (
 organization_id CHAR(36) NOT NULL, website_id CHAR(36) NOT NULL,
 authorization_id VARCHAR(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL, approval_decision_id VARCHAR(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL, claim_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL, actor_id CHAR(36) NOT NULL,
 content_id VARCHAR(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL, content_version BIGINT UNSIGNED NOT NULL, destination_id VARCHAR(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
 policy_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL, connector_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL, used_at DATETIME(6) NOT NULL,
 PRIMARY KEY (organization_id,website_id,authorization_id), UNIQUE KEY uq_approval_use (organization_id,website_id,content_id,approval_decision_id),
 KEY fk_use_auth_source_idx (organization_id,website_id,authorization_id,content_id,approval_decision_id,destination_id),
 CONSTRAINT fk_use_auth_source FOREIGN KEY (organization_id,website_id,authorization_id,content_id,approval_decision_id,destination_id) REFERENCES growth_content_authorizations(organization_id,website_id,id,content_id,approval_event_id,destination_id),
 KEY fk_use_auth_claim_idx (organization_id,website_id,authorization_id,claim_hash),
 CONSTRAINT fk_use_auth_claim FOREIGN KEY (organization_id,website_id,authorization_id,claim_hash) REFERENCES growth_content_authorizations(organization_id,website_id,id,claim_hash),
 KEY fk_use_claim_idx (organization_id,claim_hash),
 CONSTRAINT fk_use_claim FOREIGN KEY (organization_id,claim_hash) REFERENCES growth_publication_claims(organization_id,claim_hash),
 KEY fk_use_actor_idx (actor_id),
 CONSTRAINT fk_use_actor FOREIGN KEY (actor_id) REFERENCES growth_users(id)

) ENGINE=InnoDB ROW_FORMAT=DYNAMIC DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci//

-- @statement
CREATE TRIGGER growth_probe_history_update BEFORE UPDATE ON growth_connector_evidence_history FOR EACH ROW
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='AUTH_TRUST_JOURNAL_IMMUTABLE'//

-- @statement
CREATE TRIGGER growth_probe_history_delete BEFORE DELETE ON growth_connector_evidence_history FOR EACH ROW
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='AUTH_TRUST_JOURNAL_IMMUTABLE'//

-- @statement
CREATE TRIGGER growth_auth_events_update BEFORE UPDATE ON growth_publication_authorization_events FOR EACH ROW
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='AUTH_TRUST_JOURNAL_IMMUTABLE'//

-- @statement
CREATE TRIGGER growth_auth_events_delete BEFORE DELETE ON growth_publication_authorization_events FOR EACH ROW
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='AUTH_TRUST_JOURNAL_IMMUTABLE'//

-- @statement
CREATE TRIGGER growth_auth_uses_update BEFORE UPDATE ON growth_publication_authorization_uses FOR EACH ROW
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='AUTH_TRUST_JOURNAL_IMMUTABLE'//

-- @statement
CREATE TRIGGER growth_auth_uses_delete BEFORE DELETE ON growth_publication_authorization_uses FOR EACH ROW
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='AUTH_TRUST_JOURNAL_IMMUTABLE'//

-- @statement
CREATE TRIGGER growth_auth_insert_guard BEFORE INSERT ON growth_content_authorizations FOR EACH ROW
BEGIN IF NEW.revoked_at IS NOT NULL OR NEW.consumed_at IS NOT NULL OR NEW.claim_hash IS NOT NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='AUTH_MUST_START_UNUSED'; END IF; END//

-- @statement
CREATE TRIGGER growth_auth_update_guard BEFORE UPDATE ON growth_content_authorizations FOR EACH ROW
BEGIN IF NOT (BINARY NEW.organization_id <=> BINARY OLD.organization_id) OR NOT (BINARY NEW.website_id <=> BINARY OLD.website_id) OR NOT (BINARY NEW.id <=> BINARY OLD.id) OR NOT (BINARY NEW.content_id <=> BINARY OLD.content_id) OR NOT (BINARY NEW.content_version <=> BINARY OLD.content_version) OR NOT (BINARY NEW.channel <=> BINARY OLD.channel) OR NOT (BINARY NEW.approval_event_id <=> BINARY OLD.approval_event_id) OR NOT (BINARY NEW.reservation_id <=> BINARY OLD.reservation_id) OR NOT (BINARY NEW.destination_id <=> BINARY OLD.destination_id) OR NOT (BINARY NEW.approver_id <=> BINARY OLD.approver_id) OR NOT (BINARY NEW.authorization_json <=> BINARY OLD.authorization_json) OR OLD.revoked_at IS NOT NULL OR OLD.consumed_at IS NOT NULL OR NOT ((NEW.revoked_at IS NOT NULL AND NEW.consumed_at IS NULL AND NEW.claim_hash IS NULL) OR (NEW.revoked_at IS NULL AND NEW.consumed_at IS NOT NULL AND NEW.claim_hash IS NOT NULL)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='AUTH_IDENTITY_OR_TERMINAL_IMMUTABLE'; END IF; END//

-- @statement
CREATE TRIGGER growth_auth_no_delete BEFORE DELETE ON growth_content_authorizations FOR EACH ROW
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='AUTH_IDENTITY_IMMUTABLE'//

-- @statement
CREATE TRIGGER growth_auth_policy_update_guard BEFORE UPDATE ON growth_publication_policy_revisions FOR EACH ROW
BEGIN IF NOT (BINARY NEW.organization_id <=> BINARY OLD.organization_id) OR NOT (BINARY NEW.website_id <=> BINARY OLD.website_id) OR NOT (BINARY NEW.content_type <=> BINARY OLD.content_type) OR NEW.revision_number <= OLD.revision_number OR BINARY NEW.revision=BINARY OLD.revision THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='AUTH_REVISION_MUST_ADVANCE'; END IF; END//

-- @statement
CREATE TRIGGER growth_auth_policy_no_delete BEFORE DELETE ON growth_publication_policy_revisions FOR EACH ROW
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='AUTH_REVISION_IMMUTABLE'//

-- @statement
CREATE TRIGGER growth_auth_destination_update_guard BEFORE UPDATE ON growth_publication_destinations FOR EACH ROW
BEGIN IF NOT (BINARY NEW.organization_id <=> BINARY OLD.organization_id) OR NOT (BINARY NEW.website_id <=> BINARY OLD.website_id) OR NOT (BINARY NEW.id <=> BINARY OLD.id) OR NOT (BINARY NEW.channel <=> BINARY OLD.channel) OR NEW.revision_number <= OLD.revision_number OR BINARY NEW.revision=BINARY OLD.revision THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='AUTH_REVISION_MUST_ADVANCE'; END IF; END//

-- @statement
CREATE TRIGGER growth_auth_destination_no_delete BEFORE DELETE ON growth_publication_destinations FOR EACH ROW
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='AUTH_REVISION_IMMUTABLE'//

-- @statement
CREATE TRIGGER growth_connector_trust_update_guard BEFORE UPDATE ON growth_connector_issuer_state FOR EACH ROW
BEGIN IF NOT (BINARY NEW.issuer <=> BINARY OLD.issuer) OR NOT (BINARY NEW.key_id <=> BINARY OLD.key_id) OR NEW.generation <= OLD.generation OR (OLD.revoked=TRUE AND NEW.revoked<>TRUE) OR BINARY NEW.revision=BINARY OLD.revision THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='CONNECTOR_TRUST_ROLLBACK'; END IF; END//

-- @statement
CREATE TRIGGER growth_connector_trust_no_delete BEFORE DELETE ON growth_connector_issuer_state FOR EACH ROW
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='CONNECTOR_TRUST_IMMUTABLE'//

-- @statement
CREATE TRIGGER growth_connector_pointer_update_guard BEFORE UPDATE ON growth_connector_attestations FOR EACH ROW
BEGIN IF NOT (BINARY NEW.organization_id <=> BINARY OLD.organization_id) OR NOT (BINARY NEW.website_id <=> BINARY OLD.website_id) OR NOT (BINARY NEW.channel <=> BINARY OLD.channel) OR NOT (BINARY NEW.destination_id <=> BINARY OLD.destination_id) OR NOT (BINARY NEW.issuer <=> BINARY OLD.issuer) OR NOT (BINARY NEW.key_id <=> BINARY OLD.key_id) OR OLD.revoked_at IS NOT NULL OR NOT ((NEW.revoked_at IS NULL AND NEW.sequence>OLD.sequence AND NEW.event_id<>OLD.event_id) OR (NEW.revoked_at IS NOT NULL AND NEW.sequence=OLD.sequence AND BINARY NEW.event_id=BINARY OLD.event_id AND BINARY NEW.payload_hash=BINARY OLD.payload_hash AND BINARY NEW.signed_json=BINARY OLD.signed_json)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='CONNECTOR_POINTER_ROLLBACK'; END IF; END//

-- @statement
CREATE TRIGGER growth_connector_pointer_no_delete BEFORE DELETE ON growth_connector_attestations FOR EACH ROW
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='CONNECTOR_POINTER_IMMUTABLE'//
DELIMITER ;
