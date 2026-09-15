-- Keep Vault mutation behind the trusted server boundary. Customer authorization is checked
-- before this service-only RPC is called; tokens never pass through a browser-readable client.
create or replace function public.store_organization_integration_secret_unverified_v1(target_integration_id uuid, secret_value text)
returns uuid language plpgsql security definer set search_path='' as $$
declare request_role text:=coalesce(nullif(current_setting('request.jwt.claim.role',true),''),nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role','');existing_secret uuid;result_id uuid;
begin
  if request_role<>'service_role' then raise exception 'Service role required'; end if;
  select vault_secret_id into existing_secret from public.organization_integrations where id=target_integration_id;
  if not found then raise exception 'Integration not found'; end if;
  if length(coalesce(secret_value,''))<8 then raise exception 'Secret is invalid'; end if;
  if existing_secret is null then
    select vault.create_secret(secret_value,'rythm-integration-'||target_integration_id::text,'RYTHM organization integration credential',null) into result_id;
  else
    perform vault.update_secret(existing_secret,secret_value,null,null,null);result_id:=existing_secret;
  end if;
  update public.organization_integrations set vault_secret_id=result_id,status='verifying',updated_at=now() where id=target_integration_id;
  return result_id;
end $$;
revoke all on function public.store_organization_integration_secret_unverified_v1(uuid,text) from public,anon,authenticated;
grant execute on function public.store_organization_integration_secret_unverified_v1(uuid,text) to service_role;
revoke all on function public.set_organization_integration_secret_v1(uuid,text) from public,anon,authenticated;
