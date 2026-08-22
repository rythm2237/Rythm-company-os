create or replace function public.provision_default_communication_workspace()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
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
    new.id, 'rythm_managed', 'RYTHM Managed Email', 'provisioned', v_transport_domain,
    true, false,
    jsonb_build_object(
      'outbound_provider', 'resend',
      'inbound_provider', 'cloudflare_email_worker',
      'addressing_model', 'department.tenant@rythm-os.com',
      'transport_state', 'inbound_live_outbound_pending',
      'mvp_policy', 'approval_required',
      'credentials_stored', false
    )
  ) on conflict (organization_id, provider_code) do nothing;

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

  insert into public.audit_events (
    organization_id, actor_type, event_type, object_type, object_id, risk_level, payload
  ) values (
    new.id, 'system', 'communication.workspace_provisioned', 'organization', new.id::text, 'low',
    jsonb_build_object(
      'managed_domain', v_transport_domain,
      'addressing_model', 'department.tenant@rythm-os.com',
      'inbound_provider', 'cloudflare_email_worker',
      'outbound_provider', 'resend',
      'default_mailboxes', jsonb_build_array('contact','support','sales','finance','management'),
      'inbound_transport_enabled', true,
      'outbound_transport_enabled', false,
      'auto_send_enabled', false
    )
  );
  return new;
end;
$function$;

update public.communication_provider_connections
set inbound_enabled = true,
    metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('transport_state','inbound_live_outbound_pending'),
    updated_at = now()
where provider_code = 'rythm_managed';
