-- GrowthOS PostgreSQL foundation. Apply only after auth and backup review.
CREATE TABLE IF NOT EXISTS growth_organizations (
  id uuid PRIMARY KEY,
  name text NOT NULL
);
CREATE TABLE IF NOT EXISTS growth_memberships (
  organization_id uuid NOT NULL REFERENCES growth_organizations(id),
  user_id uuid NOT NULL,
  role text NOT NULL CHECK (role IN ('owner','admin','editor','viewer')),
  PRIMARY KEY (organization_id, user_id)
);
CREATE TABLE IF NOT EXISTS growth_websites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES growth_organizations(id),
  domain text NOT NULL,
  platform text NOT NULL CHECK (platform IN ('wordpress','nextjs','react','static','custom')),
  status text NOT NULL DEFAULT 'draft',
  timezone text NOT NULL DEFAULT 'UTC',
  verified_at timestamptz,
  automation_enabled boolean NOT NULL DEFAULT false,
  auto_publish_enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, domain),
  UNIQUE (organization_id, id)
);
CREATE TABLE IF NOT EXISTS growth_content_policies (
  organization_id uuid NOT NULL,
  website_id uuid NOT NULL,
  content_type text NOT NULL,
  weekly_limit integer NOT NULL DEFAULT 0 CHECK (weekly_limit >= 0),
  monthly_budget_minor bigint NOT NULL DEFAULT 0 CHECK (monthly_budget_minor >= 0),
  max_job_cost_minor bigint NOT NULL DEFAULT 0 CHECK (max_job_cost_minor >= 0),
  enabled boolean NOT NULL DEFAULT false,
  auto_publish boolean NOT NULL DEFAULT false,
  PRIMARY KEY (website_id, content_type),
  FOREIGN KEY (organization_id, website_id) REFERENCES growth_websites(organization_id, id)
);
CREATE TABLE IF NOT EXISTS growth_organization_budgets (
  organization_id uuid PRIMARY KEY REFERENCES growth_organizations(id),
  monthly_limit_minor bigint NOT NULL DEFAULT 0 CHECK (monthly_limit_minor >= 0),
  globally_paused boolean NOT NULL DEFAULT true
);
-- Deny access through PostgREST until reviewed tenant policies are installed.
ALTER TABLE growth_organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE growth_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE growth_websites ENABLE ROW LEVEL SECURITY;
ALTER TABLE growth_content_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE growth_organization_budgets ENABLE ROW LEVEL SECURITY;
