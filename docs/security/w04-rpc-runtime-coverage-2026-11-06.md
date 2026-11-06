# W04 | Exact RPC-by-RPC runtime coverage report

**Date:** 2026-11-06. **Source of scope:** original 52-signature live production register, inspected read-only. **Evidence environment:** Supabase staging `viqjdgohtxqkrdgwtull`. **Commit/PR:** `security/w04-rpc-definer-hardening` / PR #441 (DRAFT).

## Coverage classification and limits

- **52/52 exact original SECURITY DEFINER routines** have their `search_path` pinned with `pg_temp` explicitly last (51 callable by authenticated after the hardening; 1 internal trigger now unavailable for direct authenticated/anon execution).
- **51/51 current callable routines** were invoked under a forged-for-testing **synthetic outsider** Supabase JWT using the actual `authenticated` DB role. 37 returned errors and 14 returned non-sensitive/negative outputs or deliberately public responses. This proves this specific vector did not disclose data or persist changes, **not** that all possible inputs/roles are safe.
- **29/29** functions whose *first argument* targets an organization or Agent were invoked by **synthetic A owner** against a **present synthetic B Agent or B organization**: 28 rejections, 1 `false` entitlement; a DB assertion confirmed B Agent remained unchanged and no other B Agent was created. Covers realistic BOLA/IDOR paths for those 29 only.
- **7/7** anonymous booking/contact functions had transaction-scoped **positive E2E** tests, including valid booking → get → subscribe → cancel, available slots/dates, valid contact submission and expired-token get/cancel/push denial; additionally wrong and cross-appointment token tests passed.
- Supplementary: builder draft A→B denial; monotonic rate limit 100→101 even with `p_limit=1`; member vs owner vs service_role confidential-knowledge permissions; inactive member entitlement deny; hardened approval helper path under hostile caller path; direct trigger grant deny.
- Every synthetic DML test used `ROLLBACK`. Where appointment/Agent INSERT could fire external notification triggers, tests set `session_replication_role=replica` locally. This switch is a **test-only** privileged fixture and is **not** part of the release migration. Post-test SQL confirmed zero synthetic canary leftovers.

## Per-signature evidence matrix

| # | Exact original signature | Outsider / direct ACL | Existing foreign B entity | Public E2E |
|---|---|---|---|---|
| 01 | `agent_operational_readiness_v1(uuid)` | Synthetic outsider (51 matrix) | A owner → B actual fixture | — |
| 02 | `apply_company_template_integration_profile_v1(uuid,uuid,text)` | Synthetic outsider (51 matrix) | A owner → B actual fixture | — |
| 03 | `approve_agent_position_contract_v1(uuid)` | Synthetic outsider (51 matrix) | A owner → B actual fixture | — |
| 04 | `build_company_from_draft(uuid)` | Synthetic outsider (51 matrix) | — | — |
| 05 | `clone_agent_v1(uuid)` | Synthetic outsider (51 matrix) | A owner → B actual fixture | — |
| 06 | `complete_agent_knowledge_provisioning_v1(uuid,text)` | Synthetic outsider (51 matrix) | A owner → B actual fixture | — |
| 07 | `confirm_company_bootstrap_v1(uuid,text)` | Synthetic outsider (51 matrix) | — | — |
| 08 | `consume_api_rate_limit(text,integer,integer)` | Synthetic outsider (51 matrix) | — | — |
| 09 | `create_agent_provisioning_v3(uuid,text,text,text,text,text,text,text,text,text[],uuid,uuid,smallint,text,text,text,jsonb,jsonb,jsonb,jsonb,jsonb)` | Synthetic outsider (51 matrix) | A owner → B actual fixture | — |
| 10 | `create_agent_v1(uuid,text,text,text,uuid,uuid,smallint,text,text,jsonb,jsonb,jsonb,jsonb,jsonb)` | Synthetic outsider (51 matrix) | A owner → B actual fixture | — |
| 11 | `create_agent_v2(uuid,text,text,text,text,text,text,uuid,uuid,smallint,text,text,text,jsonb,jsonb,jsonb,jsonb,jsonb)` | Synthetic outsider (51 matrix) | A owner → B actual fixture | — |
| 12 | `create_agent_work_assignment_v1(uuid,text,text,text,jsonb,text,boolean)` | Synthetic outsider (51 matrix) | A owner → B actual fixture | — |
| 13 | `create_company_bootstrap_run_v1(uuid,uuid)` | Synthetic outsider (51 matrix) | A owner → B actual fixture | — |
| 14 | `fail_agent_knowledge_provisioning_v1(uuid,text)` | Synthetic outsider (51 matrix) | A owner → B actual fixture | — |
| 15 | `get_security_posture(uuid)` | Synthetic outsider (51 matrix) | A owner → B actual fixture | — |
| 16 | `has_active_organization_entitlement(uuid)` | Synthetic outsider (51 matrix) | A owner → B actual fixture | — |
| 17 | `is_org_member(uuid)` | Synthetic outsider (51 matrix) | — | — |
| 18 | `is_org_owner(uuid)` | Synthetic outsider (51 matrix) | — | — |
| 19 | `is_platform_admin()` | Synthetic outsider (51 matrix) | — | — |
| 20 | `list_my_organizations()` | Synthetic outsider (51 matrix) | — | — |
| 21 | `nail_2nya_admin_create_appointment(uuid,timestamp with time zone,text,text,text,text,text,text)` | Synthetic outsider (51 matrix) | — | — |
| 22 | `nail_2nya_available_dates(uuid,date,integer)` | Synthetic outsider (51 matrix) | — | 7-function public E2E |
| 23 | `nail_2nya_available_slots(date,uuid)` | Synthetic outsider (51 matrix) | — | 7-function public E2E |
| 24 | `nail_2nya_cancel_booking(uuid,text)` | Synthetic outsider (51 matrix) | — | 7-function public E2E |
| 25 | `nail_2nya_claim_admin(text)` | Synthetic outsider (51 matrix) | — | — |
| 26 | `nail_2nya_create_booking(uuid,timestamp with time zone,text,text,text,text,text)` | Synthetic outsider (51 matrix) | — | 7-function public E2E |
| 27 | `nail_2nya_create_contact_message(text,text,text,text)` | Synthetic outsider (51 matrix) | — | 7-function public E2E |
| 28 | `nail_2nya_get_booking(uuid,text)` | Synthetic outsider (51 matrix) | — | 7-function public E2E |
| 29 | `nail_2nya_is_admin()` | Synthetic outsider (51 matrix) | — | — |
| 30 | `nail_2nya_subscribe_customer_push(uuid,text,text,text,text)` | Synthetic outsider (51 matrix) | — | 7-function public E2E |
| 31 | `organization_agent_operational_readiness_v1(uuid)` | Synthetic outsider (51 matrix) | A owner → B actual fixture | — |
| 32 | `platform_confirm_company_payment_v1(uuid,text,numeric,text,timestamp with time zone,timestamp with time zone)` | Synthetic outsider (51 matrix) | — | — |
| 33 | `platform_customer_detail_v1(uuid)` | Synthetic outsider (51 matrix) | — | — |
| 34 | `platform_customer_list_v1(text,text,text,integer)` | Synthetic outsider (51 matrix) | — | — |
| 35 | `promote_agent_autonomy_v1(uuid,integer,text)` | Synthetic outsider (51 matrix) | A owner → B actual fixture | — |
| 36 | `provision_agent_template_v1(uuid,text,text)` | Synthetic outsider (51 matrix) | A owner → B actual fixture | — |
| 37 | `provision_commercial_company_v1(text,text,text)` | Synthetic outsider (51 matrix) | — | — |
| 38 | `provision_company_template(uuid,text,text)` | Synthetic outsider (51 matrix) | A owner → B actual fixture | — |
| 39 | `provision_company_template_v2(uuid,text,text)` | Synthetic outsider (51 matrix) | A owner → B actual fixture | — |
| 40 | `provision_default_integration_department_on_entitlement_v1()` | ACL revoked; no direct RPC | — | — |
| 41 | `reconnect_agent_company_knowledge_v1(uuid)` | Synthetic outsider (51 matrix) | A owner → B actual fixture | — |
| 42 | `refresh_agent_foundation_update_status(uuid)` | Synthetic outsider (51 matrix) | A owner → B actual fixture | — |
| 43 | `sanitize_agent_company_data_for_transfer(uuid)` | Synthetic outsider (51 matrix) | A owner → B actual fixture | — |
| 44 | `sanitize_agent_for_transfer(uuid)` | Synthetic outsider (51 matrix) | A owner → B actual fixture | — |
| 45 | `search_company_knowledge_for_agent_v1(uuid,uuid,text,integer)` | Synthetic outsider (51 matrix) | A owner → B actual fixture | — |
| 46 | `search_company_knowledge_for_meeting_v1(uuid,text,integer)` | Synthetic outsider (51 matrix) | A owner → B actual fixture | — |
| 47 | `set_active_organization(uuid)` | Synthetic outsider (51 matrix) | A owner → B actual fixture | — |
| 48 | `set_agent_status_v1(uuid,text)` | Synthetic outsider (51 matrix) | A owner → B actual fixture | — |
| 49 | `start_software_project_blueprint_v1(uuid,text)` | Synthetic outsider (51 matrix) | A owner → B actual fixture | — |
| 50 | `update_agent_v1(uuid,text,text,text,uuid,uuid,smallint,text,text,jsonb,jsonb,jsonb,jsonb,jsonb)` | Synthetic outsider (51 matrix) | A owner → B actual fixture | — |
| 51 | `validate_agent_work_outcome_v1(uuid,boolean,integer,text)` | Synthetic outsider (51 matrix) | — | — |
| 52 | `verify_agent_mastery_v1(uuid)` | Synthetic outsider (51 matrix) | A owner → B actual fixture | — |

## Explicitly unproven behavior and sign-off

A single outsider invocation is insufficient to assert every actor/input combination, and an E2E technical pass is not the same as authorization for public exposure. Particularly, `provision_commercial_company_v1` is an intentional authenticated **self-provisioning** operation; its outsider probe intentionally passed an invalid commercial offer and did not test a completed billing/onboarding flow. `nail_2nya_claim_admin` was checked with an invalid bootstrap secret; brute-force resilience and secret lifecycle still require separate operational review. Other nested authorization and concurrency/performance scenarios may require future targeted testing.

**Technical verdict for tested W04 cases:** PASS. **Launch acceptance:** blocked on explicit owner sign-off on seven public exceptions; review of W01/W02 dependencies and staging-vs-main migration history; separate production-merge/deploy authorization. No live production migration or merge was performed.

### Reproducible scripts

`scripts/w04-staging-catalog-assertions.sql`; `scripts/w04-staging-negative-rpc.sql`; `scripts/w04-staging-cross-tenant.sql`; `scripts/w04-staging-sensitive-knowledge.sql`; `scripts/w04-staging-public-booking-negatives.sql`; `scripts/w04-staging-booking-token-lifecycle.sql`; `scripts/w04-staging-public-booking-e2e.sql`; `scripts/w04-staging-52-rpc-outsider-matrix.sql`; `scripts/w04-staging-29-rpc-cross-tenant-matrix.sql`.

### Migrations (production not applied)

`20261106150000_w04_rpc_security_definer_hardening.sql` and `20261106180000_w04_explicit_pg_temp_for_definers.sql`. Staging validation reapplications are ledger-only separate versions and **must not be included in the production deployment**.
