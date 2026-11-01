-- DISPOSABLE REVIEW PROPOSAL ONLY. Additive to unchanged 001–009, isolated 017/018.
-- No canonical 010–016 execution, no production promotion, no automatic startup installer.
CREATE TABLE growth_dev_s04_contract (
 id TINYINT NOT NULL PRIMARY KEY, contract_version VARCHAR(40) NOT NULL, CHECK(id=1)
) ENGINE=InnoDB;
INSERT INTO growth_dev_s04_contract(id,contract_version) VALUES(1,'session04-v1');
CREATE TABLE growth_dev_bridge_batches (
 id CHAR(36) NOT NULL PRIMARY KEY, organization_id CHAR(36) NOT NULL, website_id CHAR(36) NOT NULL,
 actor_id CHAR(36) NOT NULL, request_key CHAR(36) NOT NULL, bundle_hash CHAR(64) NOT NULL,
 state ENUM('quarantined','reverted') NOT NULL, created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 UNIQUE KEY uq_bridge_request(organization_id,website_id,request_key),
 UNIQUE KEY uq_bridge_scope(organization_id,website_id,id),
 FOREIGN KEY(organization_id,website_id) REFERENCES growth_websites(organization_id,id),
 FOREIGN KEY(actor_id) REFERENCES growth_users(id)
) ENGINE=InnoDB;
CREATE TABLE growth_dev_bridge_items (
 id CHAR(36) NOT NULL PRIMARY KEY, organization_id CHAR(36) NOT NULL, website_id CHAR(36) NOT NULL,
 batch_id CHAR(36) NOT NULL, record_kind ENUM('manual_research','internal_approval','approval_decision','approval_revocation') NOT NULL,
 payload_json JSON NOT NULL,
 FOREIGN KEY(organization_id,website_id,batch_id) REFERENCES growth_dev_bridge_batches(organization_id,website_id,id)
) ENGINE=InnoDB;
CREATE TABLE growth_dev_fleet_policy (
 organization_id CHAR(36) NOT NULL PRIMARY KEY, emergency_stopped BOOLEAN NOT NULL DEFAULT TRUE,
 ai_limit_minor BIGINT UNSIGNED NOT NULL DEFAULT 0, external_enabled BOOLEAN NOT NULL DEFAULT FALSE,
 revision BIGINT UNSIGNED NOT NULL DEFAULT 1,
 FOREIGN KEY(organization_id) REFERENCES growth_organizations(id),
 CHECK(ai_limit_minor=0),CHECK(external_enabled=FALSE),CHECK(revision>0)
) ENGINE=InnoDB;
CREATE TABLE growth_dev_incidents (
 id CHAR(36) NOT NULL PRIMARY KEY, organization_id CHAR(36) NOT NULL, website_id CHAR(36) NULL,
 actor_id CHAR(36) NOT NULL, kind VARCHAR(60) NOT NULL, detail VARCHAR(240) NOT NULL,
 created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 KEY idx_portfolio_incidents(organization_id,created_at,id),
 FOREIGN KEY(organization_id) REFERENCES growth_organizations(id),FOREIGN KEY(actor_id) REFERENCES growth_users(id)
) ENGINE=InnoDB;
CREATE TRIGGER dev_incident_no_update BEFORE UPDATE ON growth_dev_incidents FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='IMMUTABLE_INCIDENT';
CREATE TRIGGER dev_incident_no_delete BEFORE DELETE ON growth_dev_incidents FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='IMMUTABLE_INCIDENT';
CREATE TABLE growth_dev_wordpress_fixtures (
 id CHAR(36) NOT NULL PRIMARY KEY, organization_id CHAR(36) NOT NULL, website_id CHAR(36) NOT NULL,
 authority_epoch BIGINT UNSIGNED NOT NULL, credential_revision BIGINT UNSIGNED NOT NULL,
 encrypted_key VARCHAR(512) NOT NULL, fingerprint CHAR(64) NOT NULL,
 state ENUM('pending','enrolled','revoked') NOT NULL, health_state ENUM('unknown','wordpress_fixture_healthy','failed') NOT NULL DEFAULT 'unknown',
 checked_at DATETIME(6) NULL,
 UNIQUE KEY uq_wp_fixture_site(organization_id,website_id),
 FOREIGN KEY(organization_id,website_id) REFERENCES growth_websites(organization_id,id)
) ENGINE=InnoDB;
CREATE TABLE growth_dev_provider_observations (
 id CHAR(36) NOT NULL PRIMARY KEY, organization_id CHAR(36) NOT NULL, website_id CHAR(36) NOT NULL,
 actor_id CHAR(36) NOT NULL, source_kind ENUM('observed_local','manual_submission','synthetic_fixture') NOT NULL,
 source_label VARCHAR(200) NOT NULL, payload_hash CHAR(64) NOT NULL, payload_json JSON NOT NULL,
 observed_at DATETIME(6) NOT NULL, created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 FOREIGN KEY(organization_id,website_id) REFERENCES growth_websites(organization_id,id),FOREIGN KEY(actor_id) REFERENCES growth_users(id)
) ENGINE=InnoDB;
CREATE TRIGGER dev_observation_no_update BEFORE UPDATE ON growth_dev_provider_observations FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='IMMUTABLE_PROVIDER_OBSERVATION';
CREATE TRIGGER dev_observation_no_delete BEFORE DELETE ON growth_dev_provider_observations FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='IMMUTABLE_PROVIDER_OBSERVATION';
