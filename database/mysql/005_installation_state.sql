-- Apply after 001_core_schema.sql, before any initial owner provisioning.
-- Keep the single row; never reset it to re-run bootstrap in an existing installation.
CREATE TABLE growth_installation_state (
 singleton_id TINYINT UNSIGNED NOT NULL PRIMARY KEY,
 installed BOOLEAN NOT NULL DEFAULT FALSE,
 CHECK (singleton_id = 1)
) ENGINE=InnoDB;
INSERT INTO growth_installation_state (singleton_id,installed) VALUES (1,FALSE);
