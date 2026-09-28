-- Enable governed RYTHM-managed outbound email after the production Resend runtime credential is configured.
-- Auto-send remains disabled; every mailbox continues to require approval.

create or replace function public.provision_default_communication_workspace()
returns trigger
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_transport_domain text := 'rythm-os.com';
begin
  insert into public.communication_settings (
    organization_id, managed_subdomain, managed_domain, communication_manager_agent_id,
    default_approval_mode, manager_escalation_priority, auto_send_enabled
  ) values (
    new.id, '', v_transport_domain, null, 'approval_required', 'high', false
  ) on conflict (organization_id) do nothing;

  insert into public.communication_provider_connections (
    organization_id, provider_code, display_name, status, external_domain,
    inbound_enabled, outbound_enabled, metadata
  ) values (
    new.id, 'rythm_managed', 'RYTHM Managed Email', 'connected', v_transport_domain,
    true, true,
    jsonb_build_object(
      'outbound_provider', 'resend',
      'inbound_provider', 'cloudflare_email_worker',
      'addressing_model', 'tenant@rythm-os.com + department.tenant@rythm-os.com',
      'transport_state', 'connected',
      'mvp_policy', 'approval_required',
      'credentials_stored', false,
      'runtime_secret_configured', true,
      'sending_domain_verified', true
    )
  ) on conflict (organization_id, provider_code) do update set
    status = 'connected',
    external_domain = excluded.external_domain,
    inbound_enabled = true,
    outbound_enabled = true,
    metadata = coalesce(public.communication_provider_connections.metadata, '{}'::jsonb) || excluded.metadata,
    updated_at = now();

  insert into public.communication_mailboxes (
    organization_id, local_part, address, display_name, purpose, mailbox_type,
    assigned_agent_id, approval_mode, is_active
  ) values (
    new.id, 'general', new.slug || '@' || v_transport_domain,
    'General', 'Primary company enquiries', 'system', null, 'approval_required', true
  ) on conflict (organization_id, local_part) do nothing;

  insert into public.communication_mailboxes (
    organization_id, local_part, address, display_name, purpose, mailbox_type,
    assigned_agent_id, approval_mode, is_active
  )
  select new.id, seed.local_part,
         seed.local_part || '.' || new.slug || '@' || v_transport_domain,
         seed.display_name, seed.purpose, 'system', null, 'approval_required', true
  from (values
    ('contact', 'Contact', 'General company enquiries'),
    ('support', 'Support', 'Customer support and service requests'),
    ('sales', 'Sales', 'Sales and commercial enquiries'),
    ('finance', 'Finance', 'Finance, billing, and payment communication'),
    ('management', 'Management', 'Executive and management communication')
  ) as seed(local_part, display_name, purpose)
  on conflict (organization_id, local_part) do nothing;

  update public.organizations
  set primary_email = new.slug || '@' || v_transport_domain,
      updated_at = now()
  where id = new.id
    and primary_email is distinct from new.slug || '@' || v_transport_domain;

  insert into public.audit_events (
    organization_id, actor_type, event_type, object_type, object_id, risk_level, payload
  ) values (
    new.id, 'system', 'communication.workspace_provisioned', 'organization', new.id::text, 'low',
    jsonb_build_object(
      'managed_domain', v_transport_domain,
      'primary_address', new.slug || '@' || v_transport_domain,
      'addressing_model', 'tenant@rythm-os.com + department.tenant@rythm-os.com',
      'inbound_provider', 'cloudflare_email_worker',
      'outbound_provider', 'resend',
      'default_mailboxes', jsonb_build_array('general','contact','support','sales','finance','management'),
      'inbound_transport_enabled', true,
      'outbound_transport_enabled', true,
      'outbound_runtime_secret_required', true,
      'outbound_governance', 'approval_required'
    )
  );
  return new;
end;
$$;

revoke all on function public.provision_default_communication_workspace() from public, anon, authenticated;
grant execute on function public.provision_default_communication_workspace() to service_role;

update public.communication_provider_connections
set status = 'connected',
    inbound_enabled = true,
    outbound_enabled = true,
    metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
      'outbound_provider', 'resend',
      'sending_domain_verified', true,
      'runtime_secret_configured', true,
      'credentials_stored', false,
      'transport_state', 'connected',
      'mvp_policy', 'approval_required'
    ),
    updated_at = now()
where provider_code = 'rythm_managed';

update public.communication_settings
set auto_send_enabled = false,
    default_approval_mode = 'approval_required',
    updated_at = now();
