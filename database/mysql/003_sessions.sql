-- Apply after 001_core_schema.sql. Session cookies must be Secure, HttpOnly, SameSite=Lax.
CREATE TABLE growth_sessions (
 id CHAR(36) NOT NULL PRIMARY KEY,
 user_id CHAR(36) NOT NULL,
 token_hash CHAR(64) NOT NULL,
 expires_at DATETIME NOT NULL,
 revoked_at DATETIME NULL,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE KEY uq_session_token_hash (token_hash),
 KEY idx_session_user (user_id,expires_at),
 FOREIGN KEY (user_id) REFERENCES growth_users(id) ON DELETE CASCADE
) ENGINE=InnoDB;
