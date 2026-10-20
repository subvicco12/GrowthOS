-- REVIEW CANDIDATE 013 ONLY. Requires pinned 010, 011, proposed 012; no installer registration.
-- MariaDB 11.8 / 16KiB InnoDB. DDL implicitly commits; abandon partial disposable installs.
-- No provider execution, runtime grants or production installation are authorized.
DELIMITER //
-- @statement
ALTER TABLE growth_publication_claims ADD UNIQUE KEY uq_pub_claim_binding (organization_id,website_id,content_id,channel,claim_hash,reservation_id)//
-- @statement
ALTER TABLE growth_content_authorizations ADD UNIQUE KEY uq_pub_auth_binding (organization_id,website_id,id,claim_hash,reservation_id,content_version,destination_id)//
-- @statement
ALTER TABLE growth_quota_reservations_v2 ADD UNIQUE KEY uq_pub_funding_scope (organization_id,website_id,content_id,operation,id)//
-- @statement
ALTER TABLE growth_publication_observations ADD UNIQUE KEY uq_pub_observation_digest (organization_id,issuer,event_id,payload_hash)//
-- @statement
CREATE TABLE growth_publication_funding_bindings (
 organization_id CHAR(36) NOT NULL, website_id CHAR(36) NOT NULL,
 content_id VARCHAR(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
 channel VARCHAR(80) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 authorization_id VARCHAR(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
 claim_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 generation_reservation_id CHAR(36) NOT NULL,
 publication_reservation_id VARCHAR(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
 publication_operation ENUM('generation','publication') NOT NULL DEFAULT 'publication',
 content_version BIGINT UNSIGNED NOT NULL,
 destination_id VARCHAR(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
 content_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 created_at DATETIME(6) NOT NULL,
 PRIMARY KEY (organization_id,website_id,content_id,channel),
 UNIQUE KEY uq_pub_binding_auth (organization_id,website_id,authorization_id),
 UNIQUE KEY uq_pub_binding_funding (organization_id,website_id,publication_reservation_id),
 UNIQUE KEY uq_pub_binding_claim (organization_id,claim_hash),
 UNIQUE KEY uq_pub_binding_job (organization_id,website_id,content_id,channel,authorization_id,claim_hash,publication_reservation_id),
 KEY fk_pub_auth_idx (organization_id,website_id,authorization_id,claim_hash,generation_reservation_id,content_version,destination_id),
 CONSTRAINT fk_pub_auth FOREIGN KEY (organization_id,website_id,authorization_id,claim_hash,generation_reservation_id,content_version,destination_id)
   REFERENCES growth_content_authorizations(organization_id,website_id,id,claim_hash,reservation_id,content_version,destination_id),
 KEY fk_pub_claim_idx (organization_id,website_id,content_id,channel,claim_hash,generation_reservation_id),
 CONSTRAINT fk_pub_claim FOREIGN KEY (organization_id,website_id,content_id,channel,claim_hash,generation_reservation_id)
   REFERENCES growth_publication_claims(organization_id,website_id,content_id,channel,claim_hash,reservation_id),
 KEY fk_pub_funding_idx (organization_id,website_id,content_id,publication_operation,publication_reservation_id),
 CONSTRAINT fk_pub_funding FOREIGN KEY (organization_id,website_id,content_id,publication_operation,publication_reservation_id)
   REFERENCES growth_quota_reservations_v2(organization_id,website_id,content_id,operation,id),
 KEY fk_pub_destination_idx (organization_id,website_id,destination_id),
 CONSTRAINT fk_pub_destination FOREIGN KEY (organization_id,website_id,destination_id)
   REFERENCES growth_publication_destinations(organization_id,website_id,id),
 CHECK (publication_operation='publication'), CHECK (content_version<=9007199254740991),
 CHECK (claim_hash=SHA2(CONCAT('publish:',organization_id,':',website_id,':',content_id,':',channel),256))
) ENGINE=InnoDB ROW_FORMAT=DYNAMIC DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci//
-- @statement
CREATE TABLE growth_publication_jobs (
 organization_id CHAR(36) NOT NULL, website_id CHAR(36) NOT NULL,
 id VARCHAR(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
 content_id VARCHAR(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
 channel VARCHAR(80) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 content_version BIGINT UNSIGNED NOT NULL, content_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 destination_id VARCHAR(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
 destination_revision VARCHAR(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
 destination_target_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 version BIGINT UNSIGNED NOT NULL DEFAULT 0,
 state ENUM('scheduled','awaiting_status','confirmed','absent','cancelled','operator_review') NOT NULL DEFAULT 'scheduled',
 not_before DATETIME(6) NOT NULL,
 authorization_id VARCHAR(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NULL,
 claim_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
 publication_reservation_id VARCHAR(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NULL,
 probe_attempts TINYINT UNSIGNED NOT NULL DEFAULT 0, next_probe_at DATETIME(6) NULL,
 witness_generation BIGINT UNSIGNED NULL, witness_lease_id VARCHAR(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NULL,
 job_json LONGTEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
 PRIMARY KEY (organization_id,website_id,id),
 UNIQUE KEY uq_pub_job_version_identity (organization_id,website_id,content_id,channel,content_version),
 KEY idx_pub_job_due (organization_id,state,not_before,id),
 KEY fk_pub_job_content_idx (organization_id,website_id,content_id),
 CONSTRAINT fk_pub_job_content FOREIGN KEY (organization_id,website_id,content_id) REFERENCES growth_content_records(organization_id,website_id,id),
 KEY fk_pub_job_dest_idx (organization_id,website_id,destination_id),
 CONSTRAINT fk_pub_job_dest FOREIGN KEY (organization_id,website_id,destination_id) REFERENCES growth_publication_destinations(organization_id,website_id,id),
 KEY fk_pub_job_binding_idx (organization_id,website_id,content_id,channel,authorization_id,claim_hash,publication_reservation_id),
 CONSTRAINT fk_pub_job_binding FOREIGN KEY (organization_id,website_id,content_id,channel,authorization_id,claim_hash,publication_reservation_id)
   REFERENCES growth_publication_funding_bindings(organization_id,website_id,content_id,channel,authorization_id,claim_hash,publication_reservation_id),
 CHECK (version<=9007199254740991 AND content_version<=9007199254740991 AND probe_attempts<=5),
 CHECK ((state IN ('scheduled','cancelled') AND authorization_id IS NULL AND claim_hash IS NULL AND publication_reservation_id IS NULL)
     OR (state IN ('awaiting_status','confirmed','absent','operator_review') AND authorization_id IS NOT NULL AND claim_hash IS NOT NULL AND publication_reservation_id IS NOT NULL)),
 CHECK ((state='scheduled' AND next_probe_at IS NULL) OR (state='awaiting_status' AND next_probe_at IS NOT NULL) OR (state IN ('confirmed','absent','cancelled','operator_review') AND next_probe_at IS NULL)),
 CHECK ((state IN ('scheduled','cancelled') AND witness_generation IS NULL AND witness_lease_id IS NULL) OR
        (state IN ('awaiting_status','confirmed','absent','operator_review') AND witness_generation IS NOT NULL AND witness_lease_id IS NOT NULL)),
 CHECK (JSON_VALID(job_json)),
 CHECK (JSON_EXTRACT(job_json,'$.organizationId') IS NOT NULL AND BINARY JSON_UNQUOTE(JSON_EXTRACT(job_json,'$.organizationId'))=BINARY organization_id AND
        JSON_EXTRACT(job_json,'$.websiteId') IS NOT NULL AND BINARY JSON_UNQUOTE(JSON_EXTRACT(job_json,'$.websiteId'))=BINARY website_id AND
        JSON_EXTRACT(job_json,'$.id') IS NOT NULL AND BINARY JSON_UNQUOTE(JSON_EXTRACT(job_json,'$.id'))=BINARY id AND
        JSON_EXTRACT(job_json,'$.contentId') IS NOT NULL AND BINARY JSON_UNQUOTE(JSON_EXTRACT(job_json,'$.contentId'))=BINARY content_id AND
        JSON_EXTRACT(job_json,'$.channel') IS NOT NULL AND BINARY JSON_UNQUOTE(JSON_EXTRACT(job_json,'$.channel'))=BINARY channel AND
        JSON_EXTRACT(job_json,'$.version') IS NOT NULL AND JSON_UNQUOTE(JSON_EXTRACT(job_json,'$.version'))=CAST(version AS CHAR) AND
        JSON_EXTRACT(job_json,'$.state') IS NOT NULL AND BINARY JSON_UNQUOTE(JSON_EXTRACT(job_json,'$.state'))=BINARY state)
) ENGINE=InnoDB ROW_FORMAT=DYNAMIC DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci//
-- @statement
CREATE TABLE growth_publication_job_events (
 organization_id CHAR(36) NOT NULL, website_id CHAR(36) NOT NULL,
 job_id VARCHAR(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
 event_id VARCHAR(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
 resulting_version BIGINT UNSIGNED NOT NULL,
 operation ENUM('claim','cancel','probe_failed','reconcile') NOT NULL,
 occurred_at DATETIME(6) NOT NULL,
 payload_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 observation_issuer VARCHAR(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NULL,
 observation_event_id VARCHAR(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NULL,
 observation_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
 event_json LONGTEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
 PRIMARY KEY (organization_id,website_id,job_id,event_id),
 UNIQUE KEY uq_pub_job_event_version (organization_id,website_id,job_id,resulting_version),
 KEY fk_pub_job_observation_idx (organization_id,observation_issuer,observation_event_id,observation_hash),
 CONSTRAINT fk_pub_job_event FOREIGN KEY (organization_id,website_id,job_id) REFERENCES growth_publication_jobs(organization_id,website_id,id),
 CONSTRAINT fk_pub_job_observation FOREIGN KEY (organization_id,observation_issuer,observation_event_id,observation_hash)
   REFERENCES growth_publication_observations(organization_id,issuer,event_id,payload_hash),
 CHECK (resulting_version>0 AND resulting_version<=9007199254740991),
 CHECK ((operation<>'reconcile' AND observation_issuer IS NULL AND observation_event_id IS NULL AND observation_hash IS NULL) OR
        (operation='reconcile' AND observation_issuer IS NOT NULL AND observation_event_id IS NOT NULL AND observation_hash IS NOT NULL)),
 CHECK (JSON_VALID(event_json)),
 CHECK (JSON_EXTRACT(event_json,'$.eventId') IS NOT NULL AND BINARY JSON_UNQUOTE(JSON_EXTRACT(event_json,'$.eventId'))=BINARY event_id AND
        JSON_EXTRACT(event_json,'$.operation') IS NOT NULL AND BINARY JSON_UNQUOTE(JSON_EXTRACT(event_json,'$.operation'))=BINARY operation)
) ENGINE=InnoDB ROW_FORMAT=DYNAMIC DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci//
-- @statement
CREATE TRIGGER growth_pub_binding_no_update BEFORE UPDATE ON growth_publication_funding_bindings FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='PUBLICATION_FUNDING_BINDING_IMMUTABLE'//
-- @statement
CREATE TRIGGER growth_pub_binding_no_delete BEFORE DELETE ON growth_publication_funding_bindings FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='PUBLICATION_FUNDING_BINDING_IMMUTABLE'//
-- @statement
CREATE TRIGGER growth_pub_job_insert_guard BEFORE INSERT ON growth_publication_jobs FOR EACH ROW BEGIN
 IF NEW.state<>'scheduled' OR NEW.version<>0 OR NEW.claim_hash IS NOT NULL OR NEW.authorization_id IS NOT NULL OR NEW.publication_reservation_id IS NOT NULL OR NEW.probe_attempts<>0 OR NEW.next_probe_at IS NOT NULL THEN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='PUBLICATION_JOB_MUST_START_SCHEDULED'; END IF;
END//
-- @statement
CREATE TRIGGER growth_pub_job_update_guard BEFORE UPDATE ON growth_publication_jobs FOR EACH ROW BEGIN
 IF NOT (BINARY NEW.organization_id <=> BINARY OLD.organization_id) OR NOT (BINARY NEW.website_id <=> BINARY OLD.website_id) OR
    NOT (BINARY NEW.id <=> BINARY OLD.id) OR NOT (BINARY NEW.content_id <=> BINARY OLD.content_id) OR
    NOT (BINARY NEW.channel <=> BINARY OLD.channel) OR NEW.content_version<>OLD.content_version OR
    NOT (BINARY NEW.content_hash <=> BINARY OLD.content_hash) OR NOT (BINARY NEW.destination_id <=> BINARY OLD.destination_id) OR
    NOT (BINARY NEW.destination_revision <=> BINARY OLD.destination_revision) OR NOT (BINARY NEW.destination_target_hash <=> BINARY OLD.destination_target_hash) OR
    NOT (NEW.not_before <=> OLD.not_before) OR NEW.version<>OLD.version+1 OR
    NEW.probe_attempts<OLD.probe_attempts OR NEW.probe_attempts>OLD.probe_attempts+1 OR NEW.probe_attempts>5 OR
    (OLD.claim_hash IS NOT NULL AND (NOT (BINARY NEW.claim_hash <=> BINARY OLD.claim_hash) OR
     NOT (BINARY NEW.authorization_id <=> BINARY OLD.authorization_id) OR NOT (BINARY NEW.publication_reservation_id <=> BINARY OLD.publication_reservation_id))) OR
    (OLD.witness_generation IS NOT NULL AND (NEW.witness_generation<OLD.witness_generation OR NEW.witness_generation IS NULL)) OR
    OLD.state IN ('confirmed','absent','cancelled','operator_review') OR
    NOT ((OLD.state='scheduled' AND NEW.state IN ('awaiting_status','cancelled') AND NEW.probe_attempts=0) OR
         (OLD.state='awaiting_status' AND NEW.state IN ('awaiting_status','confirmed','absent','operator_review') AND NEW.probe_attempts=OLD.probe_attempts+1 AND (NEW.state<>'operator_review' OR NEW.probe_attempts=5))) THEN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='PUBLICATION_JOB_IDENTITY_OR_TRANSITION_INVALID'; END IF;
END//
-- @statement
CREATE TRIGGER growth_pub_job_no_delete BEFORE DELETE ON growth_publication_jobs FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='PUBLICATION_JOB_IMMUTABLE'//
-- @statement
CREATE TRIGGER growth_pub_job_event_no_update BEFORE UPDATE ON growth_publication_job_events FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='PUBLICATION_JOB_EVENT_IMMUTABLE'//
-- @statement
CREATE TRIGGER growth_pub_job_event_no_delete BEFORE DELETE ON growth_publication_job_events FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='PUBLICATION_JOB_EVENT_IMMUTABLE'//
DELIMITER ;
