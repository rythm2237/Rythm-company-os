-- Secure service-side provisioning for the platform-managed Resend integration.
--
-- RYTHM keeps the Resend API key in the server runtime environment rather than
-- duplicating it into each tenant's Vault record. The generic integration guard
-- therefore needs one narrowly-scoped exception, available only while the
-- service-only provisioning RPC is executing.

create or replace function public.enforce_verified_connection_state_v1()
returns trigger
language plpgsql
set search_path = 'public'
as $$
declare
  v_new_is_managed_resend boolean := false;
  v_old_is_managed_resend boolean := false;
  v_managed_resend_context boolean :=
    coalesce(current_setting('app.rythm_managed_resend_provisioning', true), '') = '1';
begin
  v_new_is_managed_resend :=
    new.provider_key = 'resend'
    and new.display_name = 'RYTHM Managed Resend'
    and new.account_ref = 'rythm-managed';

  if tg_op = 'UPDATE' then
    v_old_is_managed_resend :=
      old.provider_key = 'resend'
      and old.display_name = 'RYTHM Managed Resend'
      and old.account_ref = 'rythm-managed';
  end if;

  -- A tenant owner may manage ordinary integrations, but the platform-managed
  -- Resend row is service-owned. This also prevents changing its identity to
  -- escape the managed integration checks.
  if (v_new_is_managed_resend or v_old_is_managed_resend)
     and not v_managed_resend_context then
    raise exception 'RYTHM-managed Resend integration is service-controlled';
  end if;

  if new.status = 'connected' and (
    (
      new.vault_secret_id is null
      and new.provider_key <> 'internal'
      and not (v_new_is_managed_resend and v_managed_resend_context)
    )
    or new.connected_at is null
    or new.last_verified_at is null
    or coalesce(new.metadata->>'verification_result', '') <> 'verified'
  ) then
    raise exception 'Connected requires a verified provider credential';
  end if;

  return new;
end;
$$;

create or replace function public.ensure_managed_resend_integration_v1(
  target_organization_id uuid,
  target_user_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = 'public', 'pg_temp'
as $$
declare
  v_integration_id uuid;
  v_now timestamptz := now();
begin
  if target_organization_id is null then
    raise exception 'organization id is required';
  end if;

  if not exists (
    select 1
    from public.organizations o
    where o.id = target_organization_id
  ) then
    raise exception 'organization does not exist';
  end if;

  -- Transaction-local capability flag. The trigger above accepts the platform
  -- environment credential model only inside this service-only RPC.
  perform set_config('app.rythm_managed_resend_provisioning', '1', true);

  insert into public.organization_integrations (
    organization_id,
    provider_key,
    display_name,
    account_ref,
    auth_type,
    status,
    enabled,
    granted_scopes,
    metadata,
    connected_by_user_id,
    connected_at,
    last_verified_at,
    updated_at
  ) values (
    target_organization_id,
    'resend',
    'RYTHM Managed Resend',
    'rythm-managed',
    'token',
    'connected',
    true,
    array['email.send']::text[],
    jsonb_build_object(
      'credential_source', 'platform_env',
      'credential_name', 'RESEND_API_KEY',
      'managed_by', 'rythm_platform',
      'verification_result', 'verified'
    ),
    target_user_id,
    v_now,
    v_now,
    v_now
  )
  on conflict (organization_id, provider_key, display_name)
  do update set
    account_ref = excluded.account_ref,
    auth_type = excluded.auth_type,
    status = 'connected',
    enabled = true,
    granted_scopes = excluded.granted_scopes,
    metadata = excluded.metadata,
    connected_by_user_id = excluded.connected_by_user_id,
    connected_at = coalesce(public.organization_integrations.connected_at, excluded.connected_at),
    last_verified_at = excluded.last_verified_at,
    updated_at = excluded.updated_at
  returning id into v_integration_id;

  perform set_config('app.rythm_managed_resend_provisioning', '0', true);
  return v_integration_id;
exception
  when others then
    perform set_config('app.rythm_managed_resend_provisioning', '0', true);
    raise;
end;
$$;

revoke all on function public.ensure_managed_resend_integration_v1(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.ensure_managed_resend_integration_v1(uuid, uuid)
  to service_role;

-- Keep the trigger helper itself unavailable as a public RPC surface.
revoke all on function public.enforce_verified_connection_state_v1()
  from public, anon, authenticated;
grant execute on function public.enforce_verified_connection_state_v1()
  to service_role;
