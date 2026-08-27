-- Phase 3 staging hotfix: pgcrypto functions are installed in the extensions schema on Supabase.
-- SECURITY DEFINER functions pin search_path, so include extensions explicitly.

alter function public.record_company_bootstrap_discovery_service_v1(uuid, jsonb, jsonb, jsonb)
  set search_path = public, extensions;

alter function public.apply_company_bootstrap_service_v1(uuid, uuid)
  set search_path = public, extensions;
