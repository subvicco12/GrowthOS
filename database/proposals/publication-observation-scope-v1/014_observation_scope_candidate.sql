-- REVIEW CANDIDATE 014 ONLY. Install only after independently certified 010-013 in a fresh empty disposable schema.
-- Preserves candidate 013; no installer registration. Refuse partial installs, retries and existing reconciliation rows.
DELIMITER //
-- @statement
ALTER TABLE growth_publication_observations ADD UNIQUE KEY uq_pub_observation_full_scope (organization_id,website_id,content_id,channel,issuer,event_id,payload_hash)//
-- @statement
ALTER TABLE growth_publication_jobs ADD UNIQUE KEY uq_pub_job_evidence_scope (organization_id,website_id,id,content_id,channel,claim_hash,destination_id)//
-- @statement
ALTER TABLE growth_publication_job_events
 ADD COLUMN content_id VARCHAR(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NULL,
 ADD COLUMN channel VARCHAR(80) CHARACTER SET ascii COLLATE ascii_bin NULL,
 ADD COLUMN claim_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
 ADD COLUMN destination_id VARCHAR(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NULL,
 ADD KEY fk_pub_event_job_scope_idx (organization_id,website_id,job_id,content_id,channel,claim_hash,destination_id),
 ADD KEY fk_pub_event_obs_scope_idx (organization_id,website_id,content_id,channel,observation_issuer,observation_event_id,observation_hash),
 ADD CONSTRAINT fk_pub_event_job_scope FOREIGN KEY (organization_id,website_id,job_id,content_id,channel,claim_hash,destination_id)
   REFERENCES growth_publication_jobs(organization_id,website_id,id,content_id,channel,claim_hash,destination_id),
 ADD CONSTRAINT fk_pub_event_obs_scope FOREIGN KEY (organization_id,website_id,content_id,channel,observation_issuer,observation_event_id,observation_hash)
   REFERENCES growth_publication_observations(organization_id,website_id,content_id,channel,issuer,event_id,payload_hash),
 ADD CONSTRAINT ck_pub_event_full_scope CHECK (
   (operation='reconcile' AND content_id IS NOT NULL AND channel IS NOT NULL AND claim_hash IS NOT NULL AND destination_id IS NOT NULL AND observation_issuer IS NOT NULL AND observation_event_id IS NOT NULL AND observation_hash IS NOT NULL) OR
   (operation<>'reconcile' AND content_id IS NULL AND channel IS NULL AND claim_hash IS NULL AND destination_id IS NULL))//
DELIMITER ;
