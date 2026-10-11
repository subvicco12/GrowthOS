-- GrowthOS MySQL 8.0+ / InnoDB. Run in an empty dedicated database only.
-- No triggers, scheduled jobs or automated publishing are installed.
CREATE TABLE growth_organizations (
 id CHAR(36) NOT NULL PRIMARY KEY, name VARCHAR(200) NOT NULL,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;
CREATE TABLE growth_users (
 id CHAR(36) NOT NULL PRIMARY KEY, email VARCHAR(320) NOT NULL UNIQUE,
 password_hash VARCHAR(255) NOT NULL, disabled BOOLEAN NOT NULL DEFAULT TRUE,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;
CREATE TABLE growth_memberships (
 organization_id CHAR(36) NOT NULL, user_id CHAR(36) NOT NULL,
 role ENUM('owner','admin','editor','viewer') NOT NULL,
 PRIMARY KEY (organization_id,user_id),
 FOREIGN KEY (organization_id) REFERENCES growth_organizations(id),
 FOREIGN KEY (user_id) REFERENCES growth_users(id)
) ENGINE=InnoDB;
CREATE TABLE growth_websites (
 id CHAR(36) NOT NULL PRIMARY KEY,
 organization_id CHAR(36) NOT NULL, domain VARCHAR(253) NOT NULL,
 platform ENUM('wordpress','nextjs','react','static','custom') NOT NULL,
 status ENUM('draft','verifying','connected','auditing','active','paused','archived') NOT NULL DEFAULT 'draft',
 timezone VARCHAR(80) NOT NULL DEFAULT 'UTC', verified_at DATETIME NULL,
 monthly_budget_minor BIGINT UNSIGNED NOT NULL DEFAULT 0,
 automation_enabled BOOLEAN NOT NULL DEFAULT FALSE,
 auto_publish_enabled BOOLEAN NOT NULL DEFAULT FALSE,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE KEY uq_org_domain (organization_id,domain),
 UNIQUE KEY uq_org_site (organization_id,id),
 FOREIGN KEY (organization_id) REFERENCES growth_organizations(id)
) ENGINE=InnoDB;
CREATE TABLE growth_content_policies (
 organization_id CHAR(36) NOT NULL, website_id CHAR(36) NOT NULL,
 content_type VARCHAR(40) NOT NULL,
 weekly_limit INT UNSIGNED NOT NULL DEFAULT 0,
 monthly_budget_minor BIGINT UNSIGNED NOT NULL DEFAULT 0,
 max_job_cost_minor BIGINT UNSIGNED NOT NULL DEFAULT 0,
 enabled BOOLEAN NOT NULL DEFAULT FALSE, auto_publish BOOLEAN NOT NULL DEFAULT FALSE,
 PRIMARY KEY (website_id,content_type),
 FOREIGN KEY (organization_id,website_id) REFERENCES growth_websites(organization_id,id)
) ENGINE=InnoDB;
CREATE TABLE growth_organization_budgets (
 organization_id CHAR(36) NOT NULL PRIMARY KEY,
 monthly_limit_minor BIGINT UNSIGNED NOT NULL DEFAULT 0,
 globally_paused BOOLEAN NOT NULL DEFAULT TRUE,
 FOREIGN KEY (organization_id) REFERENCES growth_organizations(id)
) ENGINE=InnoDB;
CREATE TABLE growth_ai_reservations (
 id CHAR(36) NOT NULL PRIMARY KEY,
 organization_id CHAR(36) NOT NULL, website_id CHAR(36) NOT NULL,
 content_type VARCHAR(40) NOT NULL, idempotency_key VARCHAR(200) NOT NULL,
 week_start DATE NOT NULL, month_start DATE NOT NULL,
 requested_units INT UNSIGNED NOT NULL,
 estimated_cost_minor BIGINT UNSIGNED NOT NULL,
 actual_cost_minor BIGINT UNSIGNED NULL,
 status ENUM('reserved','completed','cancelled') NOT NULL DEFAULT 'reserved',
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE KEY uq_org_idempotency (organization_id,idempotency_key),
 KEY idx_org_month (organization_id,month_start),
 KEY idx_site_month (website_id,content_type,month_start),
 KEY idx_site_week (website_id,content_type,week_start),
 FOREIGN KEY (organization_id,website_id) REFERENCES growth_websites(organization_id,id),
 FOREIGN KEY (website_id,content_type) REFERENCES growth_content_policies(website_id,content_type),
 CHECK (requested_units > 0)
) ENGINE=InnoDB;
