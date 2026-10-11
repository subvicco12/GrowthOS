-- Supabase Auth tenant-scoped READ policies. No client-side writes are granted.
-- Membership changes and spending operations remain server-only.
CREATE POLICY growth_org_member_read ON growth_organizations
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM growth_memberships m
    WHERE m.organization_id = growth_organizations.id AND m.user_id = (select auth.uid())
  ));
CREATE POLICY growth_membership_self_read ON growth_memberships
  FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()));
CREATE POLICY growth_website_member_read ON growth_websites
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM growth_memberships m
    WHERE m.organization_id = growth_websites.organization_id AND m.user_id = (select auth.uid())
  ));
CREATE POLICY growth_policy_member_read ON growth_content_policies
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM growth_memberships m
    WHERE m.organization_id = growth_content_policies.organization_id AND m.user_id = (select auth.uid())
  ));
CREATE POLICY growth_org_budget_member_read ON growth_organization_budgets
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM growth_memberships m
    WHERE m.organization_id = growth_organization_budgets.organization_id AND m.user_id = (select auth.uid())
  ));
CREATE POLICY growth_reservation_member_read ON growth_ai_reservations
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM growth_memberships m
    WHERE m.organization_id = growth_ai_reservations.organization_id AND m.user_id = (select auth.uid())
  ));
-- No INSERT/UPDATE/DELETE policies intentionally. A reviewed trusted server path is required.
