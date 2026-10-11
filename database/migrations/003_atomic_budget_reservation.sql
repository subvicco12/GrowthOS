-- Server-only budget reservation. Execute as a trusted database role after authenticating
-- the operator and checking organization membership in the API.
-- Currency units are integer minor units. UTC calendar periods are used consistently.
CREATE OR REPLACE FUNCTION growth_reserve_ai_budget(
  p_organization_id uuid,
  p_website_id uuid,
  p_content_type text,
  p_idempotency_key text,
  p_units integer,
  p_estimated_minor bigint
) RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_org growth_organization_budgets%ROWTYPE;
  v_site growth_websites%ROWTYPE;
  v_policy growth_content_policies%ROWTYPE;
  v_existing growth_ai_reservations%ROWTYPE;
  v_week date := date_trunc('week', now() AT TIME ZONE 'UTC')::date;
  v_month date := date_trunc('month', now() AT TIME ZONE 'UTC')::date;
  v_week_used bigint;
  v_site_spent bigint;
  v_org_spent bigint;
  v_new_id uuid;
BEGIN
  IF p_organization_id IS NULL OR p_website_id IS NULL OR
     p_content_type IS NULL OR length(p_idempotency_key) NOT BETWEEN 1 AND 200 OR
     p_units IS NULL OR p_units < 1 OR p_estimated_minor IS NULL OR p_estimated_minor < 0 THEN
    RAISE EXCEPTION 'INVALID_REQUEST';
  END IF;
  -- All reservations in one organization lock this row first, preventing concurrent overspend.
  SELECT * INTO v_org FROM growth_organization_budgets
    WHERE organization_id = p_organization_id FOR UPDATE;
  IF NOT FOUND OR v_org.globally_paused THEN RAISE EXCEPTION 'GLOBAL_PAUSE'; END IF;
  SELECT * INTO v_site FROM growth_websites
    WHERE organization_id = p_organization_id AND id = p_website_id FOR UPDATE;
  IF NOT FOUND OR v_site.status <> 'active' OR NOT v_site.automation_enabled OR v_site.verified_at IS NULL
  THEN RAISE EXCEPTION 'WEBSITE_DISABLED'; END IF;
  SELECT * INTO v_policy FROM growth_content_policies
    WHERE organization_id = p_organization_id AND website_id = p_website_id
      AND content_type = p_content_type FOR UPDATE;
  IF NOT FOUND OR NOT v_policy.enabled THEN RAISE EXCEPTION 'POLICY_DISABLED'; END IF;
  SELECT * INTO v_existing FROM growth_ai_reservations
    WHERE organization_id = p_organization_id AND idempotency_key = p_idempotency_key;
  IF FOUND THEN
    IF v_existing.website_id <> p_website_id OR v_existing.content_type <> p_content_type
       OR v_existing.requested_units <> p_units OR v_existing.estimated_cost_minor <> p_estimated_minor
    THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT'; END IF;
    RETURN v_existing.id;
  END IF;
  IF p_estimated_minor > v_policy.max_job_cost_minor THEN RAISE EXCEPTION 'JOB_COST_EXCEEDED'; END IF;
  SELECT COALESCE(sum(requested_units), 0) INTO v_week_used
    FROM growth_ai_reservations
    WHERE website_id = p_website_id AND content_type = p_content_type AND week_start = v_week
      AND status IN ('reserved','completed');
  IF p_units > v_policy.weekly_limit - v_week_used THEN RAISE EXCEPTION 'WEEKLY_QUOTA_EXCEEDED'; END IF;
  SELECT COALESCE(sum(CASE WHEN status = 'reserved' THEN estimated_cost_minor ELSE actual_cost_minor END), 0)
    INTO v_site_spent FROM growth_ai_reservations
    WHERE website_id = p_website_id AND month_start = v_month;
  IF p_estimated_minor > v_policy.monthly_budget_minor - v_site_spent
    THEN RAISE EXCEPTION 'WEBSITE_BUDGET_EXCEEDED'; END IF;
  SELECT COALESCE(sum(CASE WHEN status = 'reserved' THEN estimated_cost_minor ELSE actual_cost_minor END), 0)
    INTO v_org_spent FROM growth_ai_reservations
    WHERE organization_id = p_organization_id AND month_start = v_month;
  IF p_estimated_minor > v_org.monthly_limit_minor - v_org_spent
    THEN RAISE EXCEPTION 'ORGANIZATION_BUDGET_EXCEEDED'; END IF;
  INSERT INTO growth_ai_reservations
    (organization_id, website_id, content_type, idempotency_key,
     week_start, month_start, requested_units, estimated_cost_minor)
  VALUES (p_organization_id, p_website_id, p_content_type, p_idempotency_key,
          v_week, v_month, p_units, p_estimated_minor)
  RETURNING id INTO v_new_id;
  RETURN v_new_id;
END;
$$;
REVOKE ALL ON FUNCTION growth_reserve_ai_budget(uuid,uuid,text,text,integer,bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION growth_reserve_ai_budget(uuid,uuid,text,text,integer,bigint) FROM anon, authenticated;
-- Explicit EXECUTE must be granted to a reviewed trusted server role.
