-- Google Workspace OAuth credentials are stored as a Vault-only JSON envelope so the
-- refresh token is never written to tenant tables, prompts, logs, or execution payloads.
-- The Phase 2 executor receives only the current access token.

create or replace function public.get_organization_integration_secret_service_v1(
  target_integration_id uuid
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_role text := coalesce(
    nullif(current_setting('request.jwt.claim.role',true),''),
    nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role',
    ''
  );
  secret_id uuid;
  secret_value text;
  provider text;
  credential_format text;
  envelope jsonb;
  access_token text;
  expires_at timestamptz;
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

  if provider = 'google_workspace' and credential_format = 'oauth_token_envelope_v1' then
    begin
      envelope := secret_value::jsonb;
    exception when others then
      raise exception 'Google Workspace OAuth credential envelope is invalid';
    end;
    access_token := nullif(envelope->>'access_token', '');
    expires_at := nullif(envelope->>'expires_at', '')::timestamptz;
    if access_token is null then
      raise exception 'Google Workspace OAuth access token is unavailable';
    end if;
    if expires_at is not null and expires_at <= now() + interval '60 seconds' then
      raise exception 'Google Workspace OAuth access token expired; reconnect is required';
    end if;
    return access_token;
  end if;

  return secret_value;
end;
$$;

revoke all on function public.get_organization_integration_secret_service_v1(uuid) from public, anon, authenticated;
grant execute on function public.get_organization_integration_secret_service_v1(uuid) to service_role;
