-- ISOLATED REVIEW PROPOSAL ONLY. Requires approved 001–009 and isolated proposal 017.
-- No production installer registration. Never installs or alters candidates 010–016 or 017.
CREATE TABLE growth_dev_s03_contract (
 id TINYINT NOT NULL PRIMARY KEY, contract_version VARCHAR(40) NOT NULL, CHECK(id=1)
) ENGINE=InnoDB;
INSERT INTO growth_dev_s03_contract(id,contract_version) VALUES (1,'session03-v1');
CREATE TABLE growth_dev_ownership_grants (
 organization_id CHAR(36) NOT NULL, website_id CHAR(36) NOT NULL,
 challenge_id CHAR(36) NOT NULL, epoch BIGINT UNSIGNED NOT NULL,
 valid_until DATETIME(6) NOT NULL, revoked_at DATETIME(6) NULL,
 PRIMARY KEY(organization_id,website_id),
 FOREIGN KEY(organization_id,website_id,challenge_id) REFERENCES growth_dev_ownership(organization_id,website_id,id),
 CHECK(epoch>0)
) ENGINE=InnoDB;
CREATE TABLE growth_dev_connector_enrollments (
 id CHAR(36) NOT NULL PRIMARY KEY, organization_id CHAR(36) NOT NULL, website_id CHAR(36) NOT NULL,
 authority_epoch BIGINT UNSIGNED NOT NULL, endpoint VARCHAR(2048) NOT NULL,
 encrypted_key VARCHAR(512) NOT NULL, fingerprint CHAR(64) NOT NULL,
 state ENUM('enrolled','revoked') NOT NULL,
 health_state ENUM('unknown','synthetic_healthy','failed') NOT NULL DEFAULT 'unknown',
 checked_at DATETIME(6) NULL,
 UNIQUE KEY uq_dev_enrollment_site(organization_id,website_id),
 FOREIGN KEY(organization_id,website_id) REFERENCES growth_websites(organization_id,id)
) ENGINE=InnoDB;
CREATE TABLE growth_dev_approval_revocations (
 organization_id CHAR(36) NOT NULL, website_id CHAR(36) NOT NULL, approval_id CHAR(36) NOT NULL,
 actor_id CHAR(36) NOT NULL, reason VARCHAR(200) NOT NULL, recorded_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 PRIMARY KEY(organization_id,website_id,approval_id),
 FOREIGN KEY(organization_id,website_id,approval_id) REFERENCES growth_approval_queue(organization_id,website_id,id),
 FOREIGN KEY(actor_id) REFERENCES growth_users(id)
) ENGINE=InnoDB;
CREATE TABLE growth_dev_worker_leases (
 job_id CHAR(36) NOT NULL PRIMARY KEY, organization_id CHAR(36) NOT NULL, website_id CHAR(36) NOT NULL,
 owner_id CHAR(36) NOT NULL, fence BIGINT UNSIGNED NOT NULL,
 token_hash CHAR(64) NULL, expires_at DATETIME(6) NOT NULL,
 FOREIGN KEY(organization_id,website_id,job_id) REFERENCES growth_dev_analysis_jobs(organization_id,website_id,id),
 FOREIGN KEY(owner_id) REFERENCES growth_users(id), CHECK(fence>0)
) ENGINE=InnoDB;
CREATE TABLE growth_dev_worker_history (
 id CHAR(36) NOT NULL PRIMARY KEY, organization_id CHAR(36) NOT NULL, website_id CHAR(36) NOT NULL,
 job_id CHAR(36) NOT NULL, actor_id CHAR(36) NOT NULL, fence BIGINT UNSIGNED NOT NULL,
 event_type VARCHAR(60) NOT NULL, recorded_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 KEY idx_dev_worker_history(organization_id,website_id,recorded_at,id),
 FOREIGN KEY(organization_id,website_id,job_id) REFERENCES growth_dev_analysis_jobs(organization_id,website_id,id),
 FOREIGN KEY(actor_id) REFERENCES growth_users(id)
) ENGINE=InnoDB;
CREATE TRIGGER dev_approval_revocation_no_update BEFORE UPDATE ON growth_dev_approval_revocations FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='IMMUTABLE_APPROVAL_REVOCATION';
CREATE TRIGGER dev_approval_revocation_no_delete BEFORE DELETE ON growth_dev_approval_revocations FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='IMMUTABLE_APPROVAL_REVOCATION';
CREATE TRIGGER dev_worker_history_no_update BEFORE UPDATE ON growth_dev_worker_history FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='IMMUTABLE_WORKER_HISTORY';
CREATE TRIGGER dev_worker_history_no_delete BEFORE DELETE ON growth_dev_worker_history FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='IMMUTABLE_WORKER_HISTORY';
CREATE TABLE growth_dev_stop_fences (
 organization_id CHAR(36) NOT NULL, website_id CHAR(36) NOT NULL, fence BIGINT UNSIGNED NOT NULL,
 PRIMARY KEY(organization_id,website_id),
 FOREIGN KEY(organization_id,website_id) REFERENCES growth_websites(organization_id,id), CHECK(fence>0)
) ENGINE=InnoDB;
