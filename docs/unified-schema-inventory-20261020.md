# Unified schema inventory — offline review only

Production HOLD / NO-GO. Machine-readable exact declared columns, indexes, FK tuples, trigger identities/body hashes and ledger: `database/proposals/unified-v2/inventory.json`. Generated from unchanged pinned source packages and separately proposed 012. No candidate was installed.

| Table | Declared indexes incl. PK | FK columns | Triggers |
| --- | ---: | ---: | ---: |
| `growth_schema_migrations` | 1 | 0 | 0 |
| `growth_organizations` | 1 | 0 | 0 |
| `growth_users` | 2 | 0 | 0 |
| `growth_memberships` | 1 | 2 | 0 |
| `growth_websites` | 3 | 1 | 0 |
| `growth_content_policies` | 1 | 2 | 0 |
| `growth_organization_budgets` | 1 | 1 | 0 |
| `growth_ai_reservations` | 6 | 4 | 0 |
| `growth_budget_incidents` | 3 | 2 | 0 |
| `growth_sessions` | 3 | 1 | 0 |
| `growth_login_throttles` | 1 | 0 | 0 |
| `growth_installation_state` | 1 | 0 | 0 |
| `growth_approval_queue` | 3 | 3 | 0 |
| `growth_approval_decisions` | 3 | 4 | 2 |
| `growth_website_feature_audit` | 2 | 3 | 2 |
| `growth_content_records` | 1 | 2 | 0 |
| `growth_content_events` | 2 | 3 | 2 |
| `growth_connector_health` | 1 | 2 | 0 |
| `growth_publication_claims` | 2 | 6 | 3 |
| `growth_publication_observations` | 1 | 4 | 2 |
| `growth_publication_policy_revisions` | 2 | 4 | 2 |
| `growth_publication_destinations` | 2 | 2 | 2 |
| `growth_connector_issuer_state` | 1 | 0 | 2 |
| `growth_connector_evidence_history` | 4 | 6 | 2 |
| `growth_connector_attestations` | 3 | 7 | 2 |
| `growth_content_authorizations` | 8 | 16 | 3 |
| `growth_publication_authorization_events` | 3 | 4 | 2 |
| `growth_publication_authorization_uses` | 6 | 13 | 2 |
| `growth_quota_reservations_v2` | 7 | 7 | 3 |
| `growth_quota_events_v2` | 3 | 4 | 2 |
| `growth_quota_postings_v2` | 5 | 11 | 2 |

Total: **31 tables, 83 declared indexes, 48 FK constraints / 114 FK columns, 35 triggers, 12 ledger entries**. These are proposed/source-derived counts, not observed server metadata. Existing unnamed FK indexes may be synthesized by MariaDB; their actual names, ordering, redundant-index elimination, CHECK normalization and trigger SQL_MODE require an independently installed metadata reference. The 83 count deliberately excludes implicit indexes; it is not an asserted installed index count.

## Ledger / ordering

| Migration | SHA-256 |
| --- | --- |
| `001_core_schema.sql` | `b67ab03511cd972ee07f7e891d35134e84c0e0ac00ff8f27614f5fcf479108c6` |
| `002_budget_incidents.sql` | `2b5d77e9120b23debd57f39439ceee3fafee7b46c1c5c26c22c1597aebddab2e` |
| `003_sessions.sql` | `c2bcabc28b3c26827ea0e1f5e01b6e6c0ce0c7d9797f6c5ed9c4c60150b0b4c7` |
| `004_login_throttles.sql` | `4bf0afc1e375720abaadf5b3bc282ed0b7d5c83cd56e58f37b3b557133f1c179` |
| `005_installation_state.sql` | `4c020458375497ba0808a65ac76baaa839c13697de054608f5c42556ad14919b` |
| `006_approval_queue.sql` | `763ee4dd6b9461a799bffc1f314bc0ff69bc6dd84a52f9e96841342051f01019` |
| `007_approval_audit.sql` | `8f4fd143f23761e62f381cfcb736efe9380159bb786be07f46e9cee3d28add6f` |
| `008_approval_audit_guards.sql` | `7ad741a87d29157ed1236aacd9daef1f855b5c38f2351bb5e5cf9e305502c672` |
| `009_website_feature_audit.sql` | `b8d26a4f7f9ce93407d3a3a5c63415bf3ca32a1843275ef5a3b99ba8ff15285c` |
| `010_content_persistence_candidate.sql` | `bb10b32ec0186399ae10b1820541d4330aab500843cd0fcf2a82b4da515c2c5b` |
| `011_authorization_trust_candidate.sql` | `7b9f5b15d2797c13bc6c30d04a08d49b5112a2545f264b543e86ffd5b303362a` |
| `012_quota_v2_candidate.sql` | `6d32ff6a950e9e90c40a4c5e5892c783914847c0f518faab980f08764bc310a6` |

The ledger CREATE is separate and is not a migration entry. Its hash remains `4a20c75d96d31f23aba12256175ba927fbd2476321b8e49f3d393c5f188419ee`. Proposed order: certified ledger + 001–009, unchanged source 010, unchanged source 011, then separately reviewed 012. Record a candidate ledger row only after all its statements and independent inventory verification succeed. Installer changes are not authorized by this review. A partial DDL install is abandoned; do not resume or delete/reset ledger entries.

## Exact declared relationships

### growth_schema_migrations

Indexes: `PRIMARY(migration_id)` UNIQUE.

No FKs.

### growth_organizations

Indexes: `PRIMARY(id)` UNIQUE.

No FKs.

### growth_users

Indexes: `PRIMARY(id)` UNIQUE; `email(email)` UNIQUE.

No FKs.

### growth_memberships

Indexes: `PRIMARY(organization_id,user_id)` UNIQUE.

- `<unnamed>`: `(organization_id)` → `growth_organizations(id)`.
- `<unnamed>`: `(user_id)` → `growth_users(id)`.

### growth_websites

Indexes: `PRIMARY(id)` UNIQUE; `uq_org_domain(organization_id,domain)` UNIQUE; `uq_org_site(organization_id,id)` UNIQUE.

- `<unnamed>`: `(organization_id)` → `growth_organizations(id)`.

### growth_content_policies

Indexes: `PRIMARY(website_id,content_type)` UNIQUE.

- `<unnamed>`: `(organization_id,website_id)` → `growth_websites(organization_id,id)`.

### growth_organization_budgets

Indexes: `PRIMARY(organization_id)` UNIQUE.

- `<unnamed>`: `(organization_id)` → `growth_organizations(id)`.

### growth_ai_reservations

Indexes: `PRIMARY(id)` UNIQUE; `uq_org_idempotency(organization_id,idempotency_key)` UNIQUE; `idx_org_month(organization_id,month_start)`; `idx_site_month(website_id,content_type,month_start)`; `idx_site_week(website_id,content_type,week_start)`; `uq_reservation_scope(organization_id,website_id,id)` UNIQUE.

- `<unnamed>`: `(organization_id,website_id)` → `growth_websites(organization_id,id)`.
- `<unnamed>`: `(website_id,content_type)` → `growth_content_policies(website_id,content_type)`.

### growth_budget_incidents

Indexes: `PRIMARY(id)` UNIQUE; `uq_reservation_incident(reservation_id,incident_type)` UNIQUE; `idx_org_incident(organization_id,created_at)`.

- `<unnamed>`: `(organization_id)` → `growth_organizations(id)`.
- `<unnamed>`: `(reservation_id)` → `growth_ai_reservations(id)`.

### growth_sessions

Indexes: `PRIMARY(id)` UNIQUE; `uq_session_token_hash(token_hash)` UNIQUE; `idx_session_user(user_id,expires_at)`.

- `<unnamed>`: `(user_id)` → `growth_users(id)`.

### growth_login_throttles

Indexes: `PRIMARY(account_key)` UNIQUE.

No FKs.

### growth_installation_state

Indexes: `PRIMARY(singleton_id)` UNIQUE.

No FKs.

### growth_approval_queue

Indexes: `PRIMARY(id)` UNIQUE; `uq_approval_scope(organization_id,website_id,id)` UNIQUE; `idx_approval_org_status(organization_id,status,created_at)`.

- `<unnamed>`: `(organization_id,website_id)` → `growth_websites(organization_id,id)`.
- `<unnamed>`: `(decided_by)` → `growth_users(id)`.

### growth_approval_decisions

Indexes: `PRIMARY(id)` UNIQUE; `uq_org_decision_key(organization_id,idempotency_key)` UNIQUE; `idx_approval_history(organization_id,approval_id,created_at)`.

- `<unnamed>`: `(organization_id,website_id,approval_id)` → `growth_approval_queue(organization_id,website_id,id)`.
- `<unnamed>`: `(actor_id)` → `growth_users(id)`.

Triggers: `approval_audit_update_guard` BEFORE UPDATE, `approval_audit_delete_guard` BEFORE DELETE.

### growth_website_feature_audit

Indexes: `PRIMARY(id)` UNIQUE; `idx_feature_audit_scope(organization_id,website_id,created_at)`.

- `<unnamed>`: `(organization_id,website_id)` → `growth_websites(organization_id,id)`.
- `<unnamed>`: `(actor_id)` → `growth_users(id)`.

Triggers: `growth_feature_audit_no_update` BEFORE UPDATE, `growth_feature_audit_no_delete` BEFORE DELETE.

### growth_content_records

Indexes: `PRIMARY(organization_id,website_id,id)` UNIQUE.

- `fk_content_site`: `(organization_id,website_id)` → `growth_websites(organization_id,id)`.

### growth_content_events

Indexes: `PRIMARY(organization_id,website_id,content_id,event_id)` UNIQUE; `uq_content_version(organization_id,website_id,content_id,version)` UNIQUE.

- `fk_content_event_record`: `(organization_id,website_id,content_id)` → `growth_content_records(organization_id,website_id,id)`.

Triggers: `growth_content_events_no_update` BEFORE UPDATE, `growth_content_events_no_delete` BEFORE DELETE.

### growth_connector_health

Indexes: `PRIMARY(organization_id,website_id,channel)` UNIQUE.

- `fk_connector_site`: `(organization_id,website_id)` → `growth_websites(organization_id,id)`.

### growth_publication_claims

Indexes: `PRIMARY(organization_id,website_id,content_id,channel)` UNIQUE; `uq_claim_hash(organization_id,claim_hash)` UNIQUE.

- `fk_claim_content`: `(organization_id,website_id,content_id)` → `growth_content_records(organization_id,website_id,id)`.
- `fk_claim_reservation`: `(organization_id,website_id,reservation_id)` → `growth_ai_reservations(organization_id,website_id,id)`.

Triggers: `growth_publication_claim_insert_guard` BEFORE INSERT, `growth_publication_claim_update_guard` BEFORE UPDATE, `growth_publication_claim_no_delete` BEFORE DELETE.

### growth_publication_observations

Indexes: `PRIMARY(organization_id,issuer,event_id)` UNIQUE.

- `fk_observation_claim`: `(organization_id,website_id,content_id,channel)` → `growth_publication_claims(organization_id,website_id,content_id,channel)`.

Triggers: `growth_publication_observations_no_update` BEFORE UPDATE, `growth_publication_observations_no_delete` BEFORE DELETE.

### growth_publication_policy_revisions

Indexes: `PRIMARY(organization_id,website_id,content_type)` UNIQUE; `fk_auth_policy_type_idx(website_id,content_type)`.

- `fk_auth_policy_site`: `(organization_id,website_id)` → `growth_websites(organization_id,id)`.
- `fk_auth_policy_type`: `(website_id,content_type)` → `growth_content_policies(website_id,content_type)`.

Triggers: `growth_auth_policy_update_guard` BEFORE UPDATE, `growth_auth_policy_no_delete` BEFORE DELETE.

### growth_publication_destinations

Indexes: `PRIMARY(organization_id,website_id,id)` UNIQUE; `uq_auth_destination_channel(organization_id,website_id,channel,id)` UNIQUE.

- `fk_auth_destination_site`: `(organization_id,website_id)` → `growth_websites(organization_id,id)`.

Triggers: `growth_auth_destination_update_guard` BEFORE UPDATE, `growth_auth_destination_no_delete` BEFORE DELETE.

### growth_connector_issuer_state

Indexes: `PRIMARY(issuer,key_id)` UNIQUE.

No FKs.

Triggers: `growth_connector_trust_update_guard` BEFORE UPDATE, `growth_connector_trust_no_delete` BEFORE DELETE.

### growth_connector_evidence_history

Indexes: `PRIMARY(issuer,key_id,event_id)` UNIQUE; `uq_probe_sequence(issuer,key_id,sequence)` UNIQUE; `uq_probe_hash(issuer,key_id,event_id,payload_hash)` UNIQUE; `fk_probe_destination_idx(organization_id,website_id,channel,destination_id)`.

- `fk_probe_destination`: `(organization_id,website_id,channel,destination_id)` → `growth_publication_destinations(organization_id,website_id,channel,id)`.
- `fk_probe_issuer`: `(issuer,key_id)` → `growth_connector_issuer_state(issuer,key_id)`.

Triggers: `growth_probe_history_update` BEFORE UPDATE, `growth_probe_history_delete` BEFORE DELETE.

### growth_connector_attestations

Indexes: `PRIMARY(organization_id,website_id,channel,destination_id)` UNIQUE; `uq_current_issuer_key(issuer,key_id)` UNIQUE; `fk_attest_history_idx(issuer,key_id,event_id)`.

- `fk_attest_destination`: `(organization_id,website_id,channel,destination_id)` → `growth_publication_destinations(organization_id,website_id,channel,id)`.
- `fk_attest_history`: `(issuer,key_id,event_id)` → `growth_connector_evidence_history(issuer,key_id,event_id)`.

Triggers: `growth_connector_pointer_update_guard` BEFORE UPDATE, `growth_connector_pointer_no_delete` BEFORE DELETE.

### growth_content_authorizations

Indexes: `PRIMARY(organization_id,website_id,id)` UNIQUE; `uq_single_content_approval(organization_id,website_id,content_id,approval_event_id,channel)` UNIQUE; `uq_auth_source_scope(organization_id,website_id,id,content_id,approval_event_id,destination_id)` UNIQUE; `uq_auth_claim_scope(organization_id,website_id,id,claim_hash)` UNIQUE; `fk_auth_reservation_idx(organization_id,website_id,reservation_id)`; `fk_auth_destination_idx(organization_id,website_id,destination_id)`; `fk_auth_approver_idx(approver_id)`; `fk_auth_claim_idx(organization_id,claim_hash)`.

- `fk_auth_content`: `(organization_id,website_id,content_id)` → `growth_content_records(organization_id,website_id,id)`.
- `fk_auth_approval_event`: `(organization_id,website_id,content_id,approval_event_id)` → `growth_content_events(organization_id,website_id,content_id,event_id)`.
- `fk_auth_reservation`: `(organization_id,website_id,reservation_id)` → `growth_ai_reservations(organization_id,website_id,id)`.
- `fk_auth_destination`: `(organization_id,website_id,destination_id)` → `growth_publication_destinations(organization_id,website_id,id)`.
- `fk_auth_approver`: `(approver_id)` → `growth_users(id)`.
- `fk_auth_claim`: `(organization_id,claim_hash)` → `growth_publication_claims(organization_id,claim_hash)`.

Triggers: `growth_auth_insert_guard` BEFORE INSERT, `growth_auth_update_guard` BEFORE UPDATE, `growth_auth_no_delete` BEFORE DELETE.

### growth_publication_authorization_events

Indexes: `PRIMARY(organization_id,request_key)` UNIQUE; `idx_auth_event_scope(organization_id,website_id,authorization_id,occurred_at)`; `fk_auth_event_actor_idx(actor_id)`.

- `fk_auth_event_authorization`: `(organization_id,website_id,authorization_id)` → `growth_content_authorizations(organization_id,website_id,id)`.
- `fk_auth_event_actor`: `(actor_id)` → `growth_users(id)`.

Triggers: `growth_auth_events_update` BEFORE UPDATE, `growth_auth_events_delete` BEFORE DELETE.

### growth_publication_authorization_uses

Indexes: `PRIMARY(organization_id,website_id,authorization_id)` UNIQUE; `uq_approval_use(organization_id,website_id,content_id,approval_decision_id)` UNIQUE; `fk_use_auth_source_idx(organization_id,website_id,authorization_id,content_id,approval_decision_id,destination_id)`; `fk_use_auth_claim_idx(organization_id,website_id,authorization_id,claim_hash)`; `fk_use_claim_idx(organization_id,claim_hash)`; `fk_use_actor_idx(actor_id)`.

- `fk_use_auth_source`: `(organization_id,website_id,authorization_id,content_id,approval_decision_id,destination_id)` → `growth_content_authorizations(organization_id,website_id,id,content_id,approval_event_id,destination_id)`.
- `fk_use_auth_claim`: `(organization_id,website_id,authorization_id,claim_hash)` → `growth_content_authorizations(organization_id,website_id,id,claim_hash)`.
- `fk_use_claim`: `(organization_id,claim_hash)` → `growth_publication_claims(organization_id,claim_hash)`.
- `fk_use_actor`: `(actor_id)` → `growth_users(id)`.

Triggers: `growth_auth_uses_update` BEFORE UPDATE, `growth_auth_uses_delete` BEFORE DELETE.

### growth_quota_reservations_v2

Indexes: `PRIMARY(organization_id,website_id,id)` UNIQUE; `uq_quota_request(organization_id,request_key)` UNIQUE; `uq_quota_currency_month(organization_id,website_id,id,currency,portfolio_month)` UNIQUE; `idx_quota_week(organization_id,website_id,content_type,week_start_utc,state)`; `idx_quota_month(organization_id,portfolio_month,currency,state)`; `fk_quota_content_idx(organization_id,website_id,content_id)`; `fk_quota_policy_idx(website_id,content_type)`.

- `fk_quota_site`: `(organization_id,website_id)` → `growth_websites(organization_id,id)`.
- `fk_quota_policy`: `(website_id,content_type)` → `growth_content_policies(website_id,content_type)`.
- `fk_quota_content`: `(organization_id,website_id,content_id)` → `growth_content_records(organization_id,website_id,id)`.

Triggers: `growth_quota_insert_guard` BEFORE INSERT, `growth_quota_update_guard` BEFORE UPDATE, `growth_quota_no_delete` BEFORE DELETE.

### growth_quota_events_v2

Indexes: `PRIMARY(organization_id,request_key)` UNIQUE; `uq_quota_event_version(organization_id,website_id,reservation_id,resulting_version)` UNIQUE; `fk_quota_event_actor_idx(actor_id)`.

- `fk_quota_event_reservation`: `(organization_id,website_id,reservation_id)` → `growth_quota_reservations_v2(organization_id,website_id,id)`.
- `fk_quota_event_actor`: `(actor_id)` → `growth_users(id)`.

Triggers: `growth_quota_events_update` BEFORE UPDATE, `growth_quota_events_delete` BEFORE DELETE.

### growth_quota_postings_v2

Indexes: `PRIMARY(organization_id,website_id,id)` UNIQUE; `uq_quota_charge_scope(organization_id,website_id,reservation_id,id,currency,portfolio_month)` UNIQUE; `uq_quota_provider_event(issuer,account_id,provider_event_id)` UNIQUE; `fk_quota_posting_reservation_idx(organization_id,website_id,reservation_id,currency,portfolio_month)`; `fk_quota_original_charge_idx(organization_id,website_id,reservation_id,original_charge_id,currency,portfolio_month)`.

- `fk_quota_posting_reservation`: `(organization_id,website_id,reservation_id,currency,portfolio_month)` → `growth_quota_reservations_v2(organization_id,website_id,id,currency,portfolio_month)`.
- `fk_quota_original_charge`: `(organization_id,website_id,reservation_id,original_charge_id,currency,portfolio_month)` → `growth_quota_postings_v2(organization_id,website_id,reservation_id,id,currency,portfolio_month)`.

Triggers: `growth_quota_postings_update` BEFORE UPDATE, `growth_quota_postings_delete` BEFORE DELETE.
