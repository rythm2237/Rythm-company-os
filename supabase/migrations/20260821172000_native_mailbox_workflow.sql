-- RYTHM Company OS — Native Mailbox Workflow
-- Makes RYTHM Communication Center the primary company mailbox experience.
-- External email transport remains provider-agnostic and fail-closed until configured.

alter table public.communication_settings
  add column if not exists mailbox_mode text not null default 'rythm_native'
    check (mailbox_mode in ('rythm_native','connected_provider')),
  add column if not exists external_integrations_visible boolean not null default false;

alter table public.communication_threads
  drop constraint if exists communication_threads_status_check;

alter table public.communication_threads
  add constraint communication_threads_status_check
  check (status in ('draft','open','waiting_external','waiting_internal','approval_required','resolved','archived'));

alter table public.communication_threads
  add column if not exists created_by_user_id uuid references auth.users(id) on delete set null,
  add column if not exists draft_recipient_email text;

alter table public.communication_messages
  drop constraint if exists communication_messages_status_check;

alter table public.communication_messages
  add constraint communication_messages_status_check
  check (status in ('received','draft','pending_approval','approved','ready_for_delivery','sent','failed','cancelled'));

alter table public.communication_messages
  add column if not exists created_by_user_id uuid references auth.users(id) on delete set null,
  add column if not exists reply_to_message_id uuid references public.communication_messages(id) on delete set null;

create index if not exists communication_threads_native_drafts_idx
  on public.communication_threads (organization_id, status, updated_at desc)
  where status = 'draft';

create index if not exists communication_messages_delivery_queue_idx
  on public.communication_messages (organization_id, status, updated_at)
  where status in ('approved','ready_for_delivery');

-- Existing RYTHM-managed companies use the native mailbox as the primary UX.
update public.communication_settings
set mailbox_mode = 'rythm_native',
    external_integrations_visible = false,
    updated_at = now()
where mailbox_mode is distinct from 'rythm_native'
   or external_integrations_visible is distinct from false;

-- The managed transport adapter remains a backend concern. Do not expose it as a required
-- customer integration and never imply that external delivery is live until both directions are enabled.
update public.communication_provider_connections
set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
      'customer_mailbox_mode', 'rythm_native',
      'customer_connection_required', false,
      'provider_ui_role', 'backend_transport'
    ),
    updated_at = now()
where provider_code = 'rythm_managed';

insert into public.audit_events (
  organization_id,
  actor_type,
  event_type,
  object_type,
  object_id,
  risk_level,
  payload
)
select
  cs.organization_id,
  'system',
  'communication.native_mailbox_enabled',
  'communication_settings',
  cs.organization_id::text,
  'low',
  jsonb_build_object(
    'mailbox_mode', 'rythm_native',
    'external_integrations_visible', false,
    'external_auto_send', false
  )
from public.communication_settings cs
where not exists (
  select 1
  from public.audit_events ae
  where ae.organization_id = cs.organization_id
    and ae.event_type = 'communication.native_mailbox_enabled'
);
