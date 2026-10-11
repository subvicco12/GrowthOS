# GrowthOS database integration

The repository currently has domain rules but no deployed persistent registry or AI budget ledger.

Implement an organization-scoped website table, per-website content policies, organization budget controls, and append-only reservation and reconciliation events. All tables must use server-side authorization and tenant isolation.

Production release gates: serializable reservations across sites, idempotent retries, fail-closed provider invocation, auditable reconciliation, weekly quota reset and monthly spending reset, and database integration tests. Do not enable AI jobs until all gates pass.

Do not introduce subscriptions or payment tables in this workstream.
