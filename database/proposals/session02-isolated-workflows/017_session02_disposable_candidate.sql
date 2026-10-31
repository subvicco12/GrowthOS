-- REVIEW PROPOSAL ONLY. Independent of review-only 010–016; requires approved 001–009.
-- Install ONLY with the explicit disposable installer. No production migration registration.
CREATE TABLE growth_dev_contract (
 id TINYINT NOT NULL PRIMARY KEY,
 contract_version VARCHAR(40) NOT NULL,
 CHECK (id=1)
) ENGINE=InnoDB;
INSERT INTO growth_dev_contract(id,contract_version) VALUES (1,'session02-v1');
CREATE TABLE growth_dev_ownership (
 id CHAR(36) NOT NULL PRIMARY KEY,
 organization_id CHAR(36) NOT NULL, website_id CHAR(36) NOT NULL, actor_id CHAR(36) NOT NULL,
 domain VARCHAR(253) NOT NULL, token_hash CHAR(64) NOT NULL,
 state ENUM('pending','checking','verified','failed','superseded') NOT NULL DEFAULT 'pending',
 attempts INT UNSIGNED NOT NULL DEFAULT 0,
 expires_at DATETIME(6) NOT NULL, created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 UNIQUE KEY uq_dev_ownership_scope(organization_id,website_id,id),
 KEY idx_dev_ownership_site(organization_id,website_id,created_at),
 FOREIGN KEY (organization_id,website_id) REFERENCES growth_websites(organization_id,id),
 FOREIGN KEY (actor_id) REFERENCES growth_users(id), CHECK (attempts<=3)
) ENGINE=InnoDB;
CREATE TABLE growth_dev_analysis_jobs (
 id CHAR(36) NOT NULL PRIMARY KEY,
 organization_id CHAR(36) NOT NULL, website_id CHAR(36) NOT NULL, actor_id CHAR(36) NOT NULL,
 request_key VARCHAR(128) NOT NULL, input_hash CHAR(64) NOT NULL,
 source_label VARCHAR(200) NOT NULL, observed_at DATETIME(6) NOT NULL,
 input_json JSON NOT NULL, result_json JSON NULL,
 approval_id CHAR(36) NOT NULL,
 status ENUM('awaiting_approval','scheduled','running','completed','failed','cancelled') NOT NULL DEFAULT 'awaiting_approval',
 run_after DATETIME(6) NOT NULL, attempts INT UNSIGNED NOT NULL DEFAULT 0,
 error_code VARCHAR(60) NULL, created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 UNIQUE KEY uq_dev_job_request(organization_id,website_id,request_key),
 UNIQUE KEY uq_dev_job_scope(organization_id,website_id,id),
 KEY idx_dev_job_site(organization_id,website_id,created_at,id),
 FOREIGN KEY (organization_id,website_id) REFERENCES growth_websites(organization_id,id),
 FOREIGN KEY (organization_id,website_id,approval_id) REFERENCES growth_approval_queue(organization_id,website_id,id),
 FOREIGN KEY (actor_id) REFERENCES growth_users(id), CHECK (attempts<=3)
) ENGINE=InnoDB;
CREATE TABLE growth_dev_analysis_recommendations (
 id CHAR(36) NOT NULL PRIMARY KEY,
 organization_id CHAR(36) NOT NULL, website_id CHAR(36) NOT NULL, job_id CHAR(36) NOT NULL,
 category VARCHAR(40) NOT NULL, title VARCHAR(240) NOT NULL,
 rationale TEXT NOT NULL, evidence_url VARCHAR(2048) NOT NULL,
 priority ENUM('high','medium','review') NOT NULL,
 approval_id CHAR(36) NOT NULL,
 created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 FOREIGN KEY (organization_id,website_id,job_id) REFERENCES growth_dev_analysis_jobs(organization_id,website_id,id),
 FOREIGN KEY (organization_id,website_id,approval_id) REFERENCES growth_approval_queue(organization_id,website_id,id),
 KEY idx_dev_recommendations(organization_id,website_id,job_id)
) ENGINE=InnoDB;
CREATE TABLE growth_dev_workflow_events (
 id CHAR(36) NOT NULL PRIMARY KEY,
 organization_id CHAR(36) NOT NULL, website_id CHAR(36) NOT NULL, actor_id CHAR(36) NOT NULL,
 resource_id CHAR(36) NOT NULL, event_type VARCHAR(60) NOT NULL,
 recorded_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 KEY idx_dev_events(organization_id,website_id,recorded_at,id),
 FOREIGN KEY (organization_id,website_id) REFERENCES growth_websites(organization_id,id),
 FOREIGN KEY (actor_id) REFERENCES growth_users(id)
) ENGINE=InnoDB;
CREATE TRIGGER dev_events_no_update BEFORE UPDATE ON growth_dev_workflow_events FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='IMMUTABLE_DEV_WORKFLOW_EVENT';
CREATE TRIGGER dev_events_no_delete BEFORE DELETE ON growth_dev_workflow_events FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='IMMUTABLE_DEV_WORKFLOW_EVENT';
CREATE TRIGGER dev_recommendations_no_update BEFORE UPDATE ON growth_dev_analysis_recommendations FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='IMMUTABLE_DEV_RECOMMENDATION';
CREATE TRIGGER dev_recommendations_no_delete BEFORE DELETE ON growth_dev_analysis_recommendations FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='IMMUTABLE_DEV_RECOMMENDATION';
CREATE TABLE growth_dev_connector_drafts (
 id CHAR(36) NOT NULL PRIMARY KEY,
 organization_id CHAR(36) NOT NULL, website_id CHAR(36) NOT NULL, actor_id CHAR(36) NOT NULL,
 state ENUM('draft','revoked') NOT NULL DEFAULT 'draft',
 endpoint VARCHAR(2048) NOT NULL,
 updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 UNIQUE KEY uq_dev_connector_site(organization_id,website_id),
 FOREIGN KEY (organization_id,website_id) REFERENCES growth_websites(organization_id,id),
 FOREIGN KEY (actor_id) REFERENCES growth_users(id)
) ENGINE=InnoDB;
