-- Apply after 006. Internal decisions only; no outbound actions.
CREATE TABLE growth_approval_decisions (
 id CHAR(36) NOT NULL PRIMARY KEY,
 organization_id CHAR(36) NOT NULL,
 website_id CHAR(36) NOT NULL,
 approval_id CHAR(36) NOT NULL,
 actor_id CHAR(36) NOT NULL,
 idempotency_key VARCHAR(128) NOT NULL,
 decision ENUM('approved','rejected','deferred') NOT NULL,
 note VARCHAR(2000) NULL,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE KEY uq_org_decision_key (organization_id,idempotency_key),
 KEY idx_approval_history (organization_id,approval_id,created_at),
 FOREIGN KEY (organization_id,website_id,approval_id)
  REFERENCES growth_approval_queue(organization_id,website_id,id),
 FOREIGN KEY (actor_id) REFERENCES growth_users(id)
) ENGINE=InnoDB;
