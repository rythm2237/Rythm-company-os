-- RYTHM Company OS — platform monitoring provider registry and Vault boundary.
-- Provider credentials remain server-only and never enter tenant tables.

create table if not exists public.platform_integrations (
  id uuid primary key default gen_random_uuid(),
  provider_key text not null unique check (provider_key ~ '^[a-z0-9_]{3,64}$'),
  display_name text not null,
  status text not null default 'disconnected' check (status in ('disconnected','connected','error')),
  enabled boolean not null default true,
  account_ref text,
  property_ref text,
  granted_scopes text[] not null default '{}',
  vault_secret_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  connected_by_user_id uuid references auth.users(id) on delete set null,
  connected_at timestamptz,
  last_verified_at timestamptz,
  credential_last_rotated_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.platform_integrations enable row level security;

drop policy if exists platform_integrations_admin_read on public.platform_integrations;
create policy platform_integrations_admin_read on public.platform_integrations
for select to authenticated using (public.is_platform_admin());

revoke all on table public.platform_integrations from public, anon, authenticated;
grant select on table public.platform_integrations to authenticated;
grant all on table public.platform_integrations to service_role;

create or replace function public.get_platform_integration_secret_service_v1(
  target_provider_key text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_role text := coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb->>'role',
    ''
  );
  secret_id uuid;
  secret_value text;
begin
  if request_role <> 'service_role' then
    raise exception 'Service role required';
  end if;

  select i.vault_secret_id into secret_id
  from public.platform_integrations i
  where i.provider_key = target_provider_key
    and i.status = 'connected'
    and i.enabled = true;

  if secret_id is null then
    raise exception 'Connected platform integration credential not found';
  end if;

  select decrypted_secret into secret_value
  from vault.decrypted_secrets
  where id = secret_id;

  if secret_value is null then
    raise exception 'Platform integration credential could not be decrypted';
  end if;
  return secret_value;
end;
$$;

create or replace function public.set_platform_integration_secret_service_v1(
  target_provider_key text,
  secret_value text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_role text := coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb->>'role',
    ''
  );
  target_id uuid;
  existing_secret uuid;
  result_id uuid;
begin
  if request_role <> 'service_role' then
    raise exception 'Service role required';
  end if;
  if target_provider_key !~ '^[a-z0-9_]{3,64}$' or length(coalesce(secret_value, '')) < 32 then
    raise exception 'Platform integration credential is invalid';
  end if;

  select i.id, i.vault_secret_id into target_id, existing_secret
  from public.platform_integrations i
  where i.provider_key = target_provider_key
  for update;

  if target_id is null then
    raise exception 'Platform integration registry entry not found';
  end if;

  if existing_secret is null then
    select vault.create_secret(
      secret_value,
      'rythm-platform-' || target_provider_key,
      'RYTHM platform integration credential',
      null
    ) into result_id;
  else
    perform vault.update_secret(existing_secret, secret_value, null, null, null);
    result_id := existing_secret;
  end if;

  update public.platform_integrations
  set vault_secret_id = result_id,
      status = 'connected',
      last_error = null,
      last_verified_at = now(),
      credential_last_rotated_at = now(),
      updated_at = now()
  where id = target_id;

  return result_id;
end;
$$;

revoke all on function public.get_platform_integration_secret_service_v1(text) from public, anon, authenticated;
revoke all on function public.set_platform_integration_secret_service_v1(text, text) from public, anon, authenticated;
grant execute on function public.get_platform_integration_secret_service_v1(text) to service_role;
grant execute on function public.set_platform_integration_secret_service_v1(text, text) to service_role;

update public.automation_tasks
set name = 'Core Web Vitals',
    description = 'Collects PageSpeed Insights Lighthouse lab data and reports CrUX real-user field data only when Google has sufficient traffic evidence.',
    configuration_status = 'needs_configuration',
    config = '{"provider":"pagespeed_insights_v5","target_url":"https://rythm-os.com/","strategies":["mobile","desktop"],"required_env":"GOOGLE_PAGESPEED_API_KEY"}'::jsonb,
    updated_at = now()
where slug = 'core-web-vitals';

update public.automation_tasks
set description = 'Collects read-only Search Console performance, sampled URL indexing, sitemap and anomaly evidence for the canonical domain property.',
    configuration_status = case
      when exists (
        select 1 from public.platform_integrations
        where provider_key = 'google_search_console' and status = 'connected' and enabled = true
      ) then 'ready'
      else 'needs_configuration'
    end,
    config = '{"provider":"google_search_console","property":"sc-domain:rythm-os.com","window_days":7,"change_threshold":0.3,"monitored_urls":["https://rythm-os.com/","https://rythm-os.com/product","https://rythm-os.com/faq","https://rythm-os.com/docs","https://rythm-os.com/ai-company-operating-system","https://rythm-os.com/ai-workforce-software"]}'::jsonb,
    updated_at = now()
where slug = 'search-index-monitoring';

update public.automation_tasks
set description = 'Requires a separately authorized backlink provider and records only directly verified referring-domain or backlink evidence.',
    configuration_status = 'needs_configuration',
    config = '{"provider_state":"CONFIGURATION_REQUIRED","required_integration":"backlink_provider","evidence_rules":{"direct_verification_required":true,"no_inference_as_backlink":true,"no_purchase_without_approval":true}}'::jsonb,
    updated_at = now()
where slug = 'authority-monitoring';

comment on table public.platform_integrations is 'Platform-level provider metadata. Credentials are referenced only by Vault UUID and never stored in this table.';
