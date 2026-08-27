-- Phase 3 hardening: owner-facing bootstrap RPCs are authenticated-only.
revoke execute on function public.create_company_bootstrap_run_v1(uuid, uuid) from anon;
revoke execute on function public.confirm_company_bootstrap_v1(uuid, text) from anon;

grant execute on function public.create_company_bootstrap_run_v1(uuid, uuid) to authenticated;
grant execute on function public.confirm_company_bootstrap_v1(uuid, text) to authenticated;
