create or replace function public.get_organization_integration_secret_service_v1(target_integration_id uuid)
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
  provider text;
  credential_format text;
begin
  if request_role <> 'service_role' then
    raise exception 'Service role required';
  end if;

  select i.vault_secret_id, i.provider_key, i.metadata->>'credential_format'
    into secret_id, provider, credential_format
  from public.organization_integrations i
  where i.id = target_integration_id
    and i.status = 'connected'
    and i.enabled = true;

  if secret_id is null then
    raise exception 'Connected integration credential not found';
  end if;

  select decrypted_secret into secret_value
  from vault.decrypted_secrets
  where id = secret_id;

  if secret_value is null then
    raise exception 'Integration credential could not be decrypted';
  end if;

  -- Google Workspace needs the encrypted OAuth envelope at the service boundary so
  -- the executor can use the refresh token without exposing it to user sessions.
  if provider = 'google_workspace' and credential_format = 'oauth_token_envelope_v1' then
    return secret_value;
  end if;

  return secret_value;
end;
$$;

create or replace function public.rotate_organization_integration_secret_service_v1(
  target_integration_id uuid,
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
  target_org uuid;
  existing_secret uuid;
  provider text;
  credential_format text;
begin
  if request_role <> 'service_role' then
    raise exception 'Service role required';
  end if;

  select i.organization_id, i.vault_secret_id, i.provider_key, i.metadata->>'credential_format'
    into target_org, existing_secret, provider, credential_format
  from public.organization_integrations i
  where i.id = target_integration_id
    and i.status = 'connected'
    and i.enabled = true;

  if target_org is null or existing_secret is null then
    raise exception 'Connected integration credential not found';
  end if;
  if provider <> 'google_workspace' or credential_format <> 'oauth_token_envelope_v1' then
    raise exception 'Service credential rotation is not allowed for this integration';
  end if;
  if length(coalesce(secret_value, '')) < 32 then
    raise exception 'Secret is invalid';
  end if;

  perform vault.update_secret(existing_secret, secret_value, null, null, null);

  update public.organization_integrations
  set last_verified_at = now(),
      credential_last_rotated_at = now(),
      updated_at = now()
  where id = target_integration_id
    and organization_id = target_org;

  return existing_secret;
end;
$$;

revoke all on function public.get_organization_integration_secret_service_v1(uuid) from public, anon, authenticated;
revoke all on function public.rotate_organization_integration_secret_service_v1(uuid, text) from public, anon, authenticated;
grant execute on function public.get_organization_integration_secret_service_v1(uuid) to service_role;
grant execute on function public.rotate_organization_integration_secret_service_v1(uuid, text) to service_role;
