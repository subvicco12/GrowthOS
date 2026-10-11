-- Growth OS migration ledger, reserved for future explicitly approved installation.
-- Not applied to any database by this commit.
CREATE TABLE growth_schema_migrations (
  migration_id VARCHAR(120) NOT NULL PRIMARY KEY,
  sha256 CHAR(64) NOT NULL,
  applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  engine_version VARCHAR(120) NOT NULL
) ENGINE=InnoDB;
