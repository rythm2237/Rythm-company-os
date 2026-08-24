-- Service executor may decrypt one credential after application governance has authorized an execution.
create or replace function public.get_organization_integration_secret_service_v1(target_integration_id uuid)
returns text
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  secret_id uuid;
  secret_value text;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Service role required';
  end if;
  select vault_secret_id into secret_id from public.organization_integrations where id=target_integration_id and status='connected';
  if secret_id is null then raise exception 'Connected integration credential not found'; end if;
  select decrypted_secret into secret_value from vault.decrypted_secrets where id=secret_id;
  if secret_value is null then raise exception 'Integration credential could not be decrypted'; end if;
  return secret_value;
end; $$;
revoke all on function public.get_organization_integration_secret_service_v1(uuid) from public, anon, authenticated;
grant execute on function public.get_organization_integration_secret_service_v1(uuid) to service_role;
