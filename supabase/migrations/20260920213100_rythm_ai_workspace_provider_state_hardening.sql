-- Fail-safe provider-state hardening: once an external call may begin, reservations can no longer be released as unspent.
create or replace function public.aiw_mark_provider_started(p_request uuid, p_provider text, p_model text, p_provider_request text default null)
returns boolean language plpgsql security invoker set search_path='' as $$
begin
  update public.ai_usage_requests
  set status='provider_started',
      provider=case when p_provider is null or p_provider='' then provider else p_provider end,
      model=case when p_model is null or p_model='' then model else p_model end,
      provider_request_id=coalesce(p_provider_request,provider_request_id),
      provider_started_at=coalesce(provider_started_at,now())
  where id=p_request and status in ('reserved','provider_started');
  return found;
end $$;
revoke all on function public.aiw_mark_provider_started from public, anon, authenticated;
grant execute on function public.aiw_mark_provider_started to service_role;
