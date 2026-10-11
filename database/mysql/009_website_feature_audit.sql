-- Append-only audit for manual website feature shutdowns.
-- Apply only in a dedicated test database after migration 001.
CREATE TABLE growth_website_feature_audit (
 id CHAR(36) NOT NULL PRIMARY KEY,
 organization_id CHAR(36) NOT NULL,
 website_id CHAR(36) NOT NULL,
 actor_id CHAR(36) NOT NULL,
 feature ENUM('automation','auto_publish') NOT NULL,
 enabled BOOLEAN NOT NULL DEFAULT FALSE,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 KEY idx_feature_audit_scope (organization_id,website_id,created_at),
 FOREIGN KEY (organization_id,website_id) REFERENCES growth_websites(organization_id,id),
 FOREIGN KEY (actor_id) REFERENCES growth_users(id),
 CHECK (enabled = FALSE)
) ENGINE=InnoDB;

CREATE TRIGGER growth_feature_audit_no_update
BEFORE UPDATE ON growth_website_feature_audit
FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Feature audit entries are immutable';

CREATE TRIGGER growth_feature_audit_no_delete
BEFORE DELETE ON growth_website_feature_audit
FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Feature audit entries cannot be deleted';
