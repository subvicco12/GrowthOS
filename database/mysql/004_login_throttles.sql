-- Apply after 001_core_schema.sql.
CREATE TABLE growth_login_throttles (
 account_key CHAR(64) NOT NULL PRIMARY KEY,
 failed_attempts INT UNSIGNED NOT NULL DEFAULT 0,
 locked_until DATETIME NULL,
 updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;
