-- Apply after 001_core_schema.sql; incident rows are retained for audit.
CREATE TABLE growth_budget_incidents (
 id CHAR(36) NOT NULL PRIMARY KEY,
 organization_id CHAR(36) NOT NULL,
 reservation_id CHAR(36) NOT NULL,
 incident_type ENUM('COST_OVERRUN') NOT NULL,
 estimated_minor BIGINT UNSIGNED NOT NULL,
 actual_minor BIGINT UNSIGNED NOT NULL,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE KEY uq_reservation_incident (reservation_id,incident_type),
 KEY idx_org_incident (organization_id,created_at),
 FOREIGN KEY (organization_id) REFERENCES growth_organizations(id),
 FOREIGN KEY (reservation_id) REFERENCES growth_ai_reservations(id)
) ENGINE=InnoDB;
