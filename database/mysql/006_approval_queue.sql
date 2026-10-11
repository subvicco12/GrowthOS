-- GrowthOS internal approval queue. This migration performs no external actions.
CREATE TABLE growth_approval_queue (
 id CHAR(36) NOT NULL PRIMARY KEY,
 organization_id CHAR(36) NOT NULL,
 website_id CHAR(36) NOT NULL,
 title VARCHAR(240) NOT NULL,
 action_type VARCHAR(60) NOT NULL,
 status ENUM('pending','approved','rejected','deferred') NOT NULL DEFAULT 'pending',
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 decided_at DATETIME NULL,
 decided_by CHAR(36) NULL,
 decision_note VARCHAR(2000) NULL,
 UNIQUE KEY uq_approval_scope (organization_id,website_id,id),
 KEY idx_approval_org_status (organization_id,status,created_at),
 FOREIGN KEY (organization_id,website_id) REFERENCES growth_websites(organization_id,id),
 FOREIGN KEY (decided_by) REFERENCES growth_users(id)
) ENGINE=InnoDB;
