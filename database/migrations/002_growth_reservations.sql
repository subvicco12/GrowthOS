-- Append to 001. Database functions must enforce atomic limits before any billable job.
CREATE TABLE IF NOT EXISTS growth_ai_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES growth_organizations(id),
  website_id uuid NOT NULL,
  content_type text NOT NULL,
  idempotency_key text NOT NULL,
  week_start date NOT NULL,
  month_start date NOT NULL,
  requested_units integer NOT NULL CHECK (requested_units > 0),
  estimated_cost_minor bigint NOT NULL CHECK (estimated_cost_minor >= 0),
  actual_cost_minor bigint CHECK (actual_cost_minor >= 0),
  status text NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved','completed','cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, idempotency_key),
  FOREIGN KEY (organization_id, website_id) REFERENCES growth_websites(organization_id, id),
  FOREIGN KEY (website_id, content_type) REFERENCES growth_content_policies(website_id, content_type)
);
CREATE INDEX IF NOT EXISTS growth_ai_reservations_org_month
  ON growth_ai_reservations (organization_id, month_start);
CREATE INDEX IF NOT EXISTS growth_ai_reservations_site_week
  ON growth_ai_reservations (website_id, content_type, week_start);
CREATE INDEX IF NOT EXISTS growth_ai_reservations_site_month
  ON growth_ai_reservations (website_id, month_start);
ALTER TABLE growth_ai_reservations ENABLE ROW LEVEL SECURITY;
-- No permissive policies intentionally: server-side enforcement and transaction RPC pending.
