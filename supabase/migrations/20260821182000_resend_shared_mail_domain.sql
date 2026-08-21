-- RYTHM Company OS — shared Resend mail domain
-- Free-tier friendly mailbox addressing for all tenants:
--   department.company-slug@mail.rythm-os.com
-- RYTHM remains the system of record; Resend is only the managed transport layer.

-- Make inbound webhook ingestion idempotent per tenant mailbox.
create unique index if not exists communication_messages_provider_mailbox_uidx
  on public.communication_messages (organization_id, mailbox_id, provider_message_id)
  where provider_message_id is not null;

-- Backfill current tenants to the shared verified transport domain.
update public.communication_settings
set managed_subdomain = 'mail',
    managed_domain = 'rythm-os.com',
    updated_at = now();

update public.communication_provider_connections
set external_domain = 'mail.rythm-os.com',
    metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
      'transport_provider', 'resend',
      'addressing_model', 'department.tenant@mail.rythm-os.com',
      'transport_state', 'webhook_setup_pending',
      'credentials_stored', false
    ),
    updated_at = now()
where provider_code = 'rythm_managed';

update public.communication_mailboxes m
set address = m.local_part || '.' || o.slug || '@mail.rythm-os.com',
    updated_at = now()
from public.organizations o
where o.id = m.organization_id
  and m.mailbox_type = 'system';

-- Provision all future organizations using the same shared transport domain.
create or replace function public.provision_default_communication_workspace()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_transport_domain text := 'mail.rythm-os.com';
begin
  insert into public.communication_settings (
    organization_id,
    managed_subdomain,
    managed_domain,
    communication_manager_agent_id,
    default_approval_mode,
    manager_escalation_priority,
    auto_send_enabled
  ) values (
    new.id,
    'mail',
    'rythm-os.com',
    null,
    'approval_required',
    'high',
    false
  )
  on conflict (organization_id) do nothing;

  insert into public.communication_provider_connections (
    organization_id,
    provider_code,
    display_name,
    status,
    external_domain,
    inbound_enabled,
    outbound_enabled,
    metadata
  ) values (
    new.id,
    'rythm_managed',
    'RYTHM Managed Email',
    'provisioned',
    v_transport_domain,
    false,
    false,
    jsonb_build_object(
      'transport_provider', 'resend',
      'addressing_model', 'department.tenant@mail.rythm-os.com',
      'transport_state', 'webhook_setup_pending',
      'mvp_policy', 'approval_required',
      'credentials_stored', false
    )
  )
  on conflict (organization_id, provider_code) do nothing;

  insert into public.communication_mailboxes (
    organization_id,
    local_part,
    address,
    display_name,
    purpose,
    mailbox_type,
    assigned_agent_id,
    approval_mode,
    is_active
  )
  select
    new.id,
    seed.local_part,
    seed.local_part || '.' || new.slug || '@' || v_transport_domain,
    seed.display_name,
    seed.purpose,
    'system',
    null,
    'approval_required',
    true
  from (values
    ('contact', 'Contact', 'General company enquiries'),
    ('support', 'Support', 'Customer support and service requests'),
    ('sales', 'Sales', 'Sales and commercial enquiries'),
    ('finance', 'Finance', 'Finance, billing, and payment communication'),
    ('management', 'Management', 'Executive and management communication')
  ) as seed(local_part, display_name, purpose)
  on conflict (organization_id, local_part) do nothing;

  insert into public.audit_events (
    organization_id,
    actor_type,
    event_type,
    object_type,
    object_id,
    risk_level,
    payload
  ) values (
    new.id,
    'system',
    'communication.workspace_provisioned',
    'organization',
    new.id::text,
    'low',
    jsonb_build_object(
      'managed_domain', v_transport_domain,
      'addressing_model', 'department.tenant@mail.rythm-os.com',
      'default_mailboxes', jsonb_build_array('contact','support','sales','finance','management'),
      'external_transport_enabled', false,
      'auto_send_enabled', false
    )
  );

  return new;
end;
$$;

revoke all on function public.provision_default_communication_workspace() from public, anon, authenticated;
