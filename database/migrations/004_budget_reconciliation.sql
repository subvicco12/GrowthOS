-- Only a trusted server database role may execute this function.
-- Charges exceeding reservations must be recorded as an exception, not silently discarded.
CREATE OR REPLACE FUNCTION growth_finalize_ai_reservation(
  p_reservation_id uuid,
  p_actual_minor bigint,
  p_status text
) RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_res growth_ai_reservations%ROWTYPE;
BEGIN
  IF p_reservation_id IS NULL OR p_actual_minor IS NULL OR p_actual_minor < 0
     OR p_status NOT IN ('completed','cancelled') THEN
    RAISE EXCEPTION 'INVALID_RECONCILIATION';
  END IF;
  SELECT * INTO v_res FROM growth_ai_reservations WHERE id = p_reservation_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'RESERVATION_NOT_FOUND'; END IF;
  IF v_res.status <> 'reserved' THEN
    IF v_res.status = p_status AND v_res.actual_cost_minor = p_actual_minor THEN RETURN; END IF;
    RAISE EXCEPTION 'RESERVATION_ALREADY_FINALIZED';
  END IF;
  -- A higher actual charge cannot be retroactively blocked at the provider.
  -- Surface it explicitly for incident handling instead of claiming a guaranteed hard cap.
  IF p_actual_minor > v_res.estimated_cost_minor THEN
    RAISE EXCEPTION 'ACTUAL_COST_EXCEEDS_RESERVATION';
  END IF;
  UPDATE growth_ai_reservations
    SET status = p_status, actual_cost_minor = p_actual_minor
    WHERE id = p_reservation_id;
END;
$$;
REVOKE ALL ON FUNCTION growth_finalize_ai_reservation(uuid,bigint,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION growth_finalize_ai_reservation(uuid,bigint,text) FROM anon, authenticated;
