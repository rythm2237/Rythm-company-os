-- W04 | Targeted privileged RPC hardening.
-- Baseline: main 995888ae6f7077f70527bbc95f74efd584115955; live pg_proc 2026-11-06.
-- Idempotent DDL; deliberately preserves the seven public 2nya booking/contact RPC grants.
-- Do not run against production without separate owner approval.
begin;

-- Both are pure SQL IMMUTABLE SECURITY INVOKER helpers. Resolve built-ins only in
-- pg_catalog, with pg_temp last; do not depend on caller-controlled search_path.
alter function public.project_approval_decision_group_v1(text, text)
  set search_path = pg_catalog, pg_temp;

alter function public.project_approval_is_delegatable_v1(
  text, text, text, text, jsonb, text, text, text
) set search_path = pg_catalog, pg_temp;

-- This function returns trigger and is invoked by database triggers, not by
-- PostgREST clients. It had PUBLIC/anon/authenticated EXECUTE in the live catalog.
-- Revoking direct invocation does not remove trigger definitions.
revoke execute on function public.provision_default_integration_department_on_entitlement_v1()
  from public, anon, authenticated;
grant execute on function public.provision_default_integration_department_on_entitlement_v1()
  to service_role;

commit;
