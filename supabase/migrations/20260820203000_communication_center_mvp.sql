-- RYTHM Company OS — Communication Center MVP
-- Managed virtual company addresses, governed routing, threads/messages, forwarding,
-- provider abstraction, and a system Communication Manager agent.
-- External transport remains fail-closed in this MVP: no automatic external sending.

create table if not exists public.communication_settings (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  managed_subdomain text not null,
  managed_domain text not null default 'rythm-os.com',
  communication_manager_agent_id uuid references public.agents(id) on delete set null,
  default_approval_mode text not null default 'approval_required'
    check (default_approval_mode in ('draft_only','approval_required','auto_send')),
  manager_escalation_priority text not null default 'high'
    check (manager_escalation_priority in ('low','normal','high','urgent')),
  auto_send_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.communication_provider_connections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  provider_code text not null
    check (provider_code in ('rythm_managed','gmail','microsoft365','custom_domain')),
  display_name text not null,
  status text not null default 'planned'
    check (status in ('planned','provisioned','connected','error','disabled')),
  external_domain text,
  inbound_enabled boolean not null default false,
  outbound_enabled boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  last_sync_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, provider_code)
);

create table if not exists public.communication_mailboxes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  local_part text not null,
  address text not null,
  display_name text not null,
  purpose text not null,
  mailbox_type text not null default 'system'
    check (mailbox_type in ('system','custom')),
  assigned_agent_id uuid references public.agents(id) on delete set null,
  approval_mode text not null default 'approval_required'
    check (approval_mode in ('draft_only','approval_required','auto_send')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, local_part)
);

create unique index if not exists communication_mailboxes_address_lower_uidx
  on public.communication_mailboxes (lower(address));
create index if not exists communication_mailboxes_org_active_idx
  on public.communication_mailboxes (organization_id, is_active, local_part);

create table if not exists public.communication_forwarding_rules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  mailbox_id uuid not null references public.communication_mailboxes(id) on delete cascade,
  destination_email text not null,
  verification_status text not null default 'pending'
    check (verification_status in ('pending','verified','failed','disabled')),
  is_active boolean not null default false,
  created_by_user_id uuid references auth.users(id) on delete set null,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (mailbox_id, destination_email)
);

create index if not exists communication_forwarding_rules_org_idx
  on public.communication_forwarding_rules (organization_id, mailbox_id, verification_status);

create table if not exists public.communication_threads (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  mailbox_id uuid references public.communication_mailboxes(id) on delete set null,
  subject text not null default '(no subject)',
  normalized_subject text,
  status text not null default 'open'
    check (status in ('open','waiting_external','waiting_internal','approval_required','resolved','archived')),
  priority text not null default 'normal'
    check (priority in ('low','normal','high','urgent')),
  category text,
  sender_name text,
  sender_email text,
  assigned_agent_id uuid references public.agents(id) on delete set null,
  requires_manager_attention boolean not null default false,
  manager_attention_reason text,
  ai_summary text,
  related_meeting_id uuid references public.meetings(id) on delete set null,
  related_action_item_id uuid references public.action_items(id) on delete set null,
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists communication_threads_org_status_idx
  on public.communication_threads (organization_id, status, last_message_at desc);
create index if not exists communication_threads_org_priority_idx
  on public.communication_threads (organization_id, priority, last_message_at desc);
create index if not exists communication_threads_agent_idx
  on public.communication_threads (organization_id, assigned_agent_id, status);

create table if not exists public.communication_messages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  thread_id uuid not null references public.communication_threads(id) on delete cascade,
  mailbox_id uuid references public.communication_mailboxes(id) on delete set null,
  direction text not null
    check (direction in ('inbound','outbound','draft')),
  status text not null default 'received'
    check (status in ('received','draft','pending_approval','approved','sent','failed')),
  provider_message_id text,
  sender_name text,
  sender_email text,
  recipients jsonb not null default '[]'::jsonb,
  cc_recipients jsonb not null default '[]'::jsonb,
  subject text,
  body_text text,
  body_html text,
  drafted_by_agent_id uuid references public.agents(id) on delete set null,
  approved_by_user_id uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  sent_by_user_id uuid references auth.users(id) on delete set null,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists communication_messages_thread_idx
  on public.communication_messages (thread_id, created_at);
create index if not exists communication_messages_org_status_idx
  on public.communication_messages (organization_id, status, created_at desc);

alter table public.communication_settings enable row level security;
alter table public.communication_provider_connections enable row level security;
alter table public.communication_mailboxes enable row level security;
alter table public.communication_forwarding_rules enable row level security;
alter table public.communication_threads enable row level security;
alter table public.communication_messages enable row level security;

-- Members may read their own organization communication workspace.
drop policy if exists communication_settings_member_read on public.communication_settings;
create policy communication_settings_member_read
on public.communication_settings for select to authenticated
using (public.is_org_member(organization_id));

drop policy if exists communication_provider_connections_member_read on public.communication_provider_connections;
create policy communication_provider_connections_member_read
on public.communication_provider_connections for select to authenticated
using (public.is_org_member(organization_id));

drop policy if exists communication_mailboxes_member_read on public.communication_mailboxes;
create policy communication_mailboxes_member_read
on public.communication_mailboxes for select to authenticated
using (public.is_org_member(organization_id));

drop policy if exists communication_forwarding_rules_member_read on public.communication_forwarding_rules;
create policy communication_forwarding_rules_member_read
on public.communication_forwarding_rules for select to authenticated
using (public.is_org_member(organization_id));

drop policy if exists communication_threads_member_read on public.communication_threads;
create policy communication_threads_member_read
on public.communication_threads for select to authenticated
using (public.is_org_member(organization_id));

drop policy if exists communication_messages_member_read on public.communication_messages;
create policy communication_messages_member_read
on public.communication_messages for select to authenticated
using (public.is_org_member(organization_id));

-- Configuration and human-governed message mutations remain owner-only.
drop policy if exists communication_settings_owner_manage on public.communication_settings;
create policy communication_settings_owner_manage
on public.communication_settings for all to authenticated
using (public.is_org_owner(organization_id))
with check (public.is_org_owner(organization_id));

drop policy if exists communication_provider_connections_owner_manage on public.communication_provider_connections;
create policy communication_provider_connections_owner_manage
on public.communication_provider_connections for all to authenticated
using (public.is_org_owner(organization_id))
with check (public.is_org_owner(organization_id));

drop policy if exists communication_mailboxes_owner_manage on public.communication_mailboxes;
create policy communication_mailboxes_owner_manage
on public.communication_mailboxes for all to authenticated
using (public.is_org_owner(organization_id))
with check (public.is_org_owner(organization_id));

drop policy if exists communication_forwarding_rules_owner_manage on public.communication_forwarding_rules;
create policy communication_forwarding_rules_owner_manage
on public.communication_forwarding_rules for all to authenticated
using (public.is_org_owner(organization_id))
with check (public.is_org_owner(organization_id));

drop policy if exists communication_threads_owner_manage on public.communication_threads;
create policy communication_threads_owner_manage
on public.communication_threads for all to authenticated
using (public.is_org_owner(organization_id))
with check (public.is_org_owner(organization_id));

drop policy if exists communication_messages_owner_manage on public.communication_messages;
create policy communication_messages_owner_manage
on public.communication_messages for all to authenticated
using (public.is_org_owner(organization_id))
with check (public.is_org_owner(organization_id));

revoke all on table public.communication_settings from anon;
revoke all on table public.communication_provider_connections from anon;
revoke all on table public.communication_mailboxes from anon;
revoke all on table public.communication_forwarding_rules from anon;
revoke all on table public.communication_threads from anon;
revoke all on table public.communication_messages from anon;

grant select, insert, update, delete on table public.communication_settings to authenticated;
grant select, insert, update, delete on table public.communication_provider_connections to authenticated;
grant select, insert, update, delete on table public.communication_mailboxes to authenticated;
grant select, insert, update, delete on table public.communication_forwarding_rules to authenticated;
grant select, insert, update, delete on table public.communication_threads to authenticated;
grant select, insert, update, delete on table public.communication_messages to authenticated;

create or replace function public.provision_default_communication_workspace()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_manager_agent_id uuid;
  v_domain text := 'rythm-os.com';
begin
  insert into public.agents (
    organization_id,
    agent_code,
    name,
    role_title,
    purpose,
    authority_level,
    risk_ceiling,
    enabled,
    specification_version,
    identity,
    permissions,
    display_name,
    department,
    responsibilities,
    skills,
    human_approval_requirements,
    allowed_tools,
    external_actions_allowed,
    agent_status,
    system_instructions
  ) values (
    new.id,
    'RYTHM-COMMS',
    'Communication Manager',
    'Communication Manager',
    'Own company communication triage, classification, routing, summarization, follow-up coordination, and governed reply drafting.',
    2,
    'medium'::public.rythm_risk_level,
    true,
    '1.0',
    jsonb_build_object('system_role', 'communication_manager', 'human_governed', true),
    jsonb_build_object('communication', jsonb_build_object(
      'read', true,
      'classify', true,
      'summarize', true,
      'assign', true,
      'draft', true,
      'send', false
    )),
    'Communication Manager',
    'Communications',
    jsonb_build_array(
      'Monitor company communication',
      'Classify and prioritize inbound messages',
      'Assign conversations to the correct agent or department',
      'Draft governed responses',
      'Escalate consequential items to the Human CEO',
      'Surface meeting and action follow-ups'
    ),
    jsonb_build_array('email triage','routing','summarization','stakeholder communication'),
    jsonb_build_array('All external email sending requires human approval in the Communication MVP'),
    jsonb_build_array('communication_inbox','communication_routing','communication_drafts'),
    false,
    'enabled',
    'Never send an external message autonomously. Read, classify, summarize, route, and draft. Escalate legal, financial, contractual, security, urgent, or high-impact communication to the Human CEO for explicit approval.'
  )
  on conflict (organization_id, agent_code) do update
  set role_title = excluded.role_title,
      purpose = excluded.purpose,
      authority_level = excluded.authority_level,
      permissions = excluded.permissions,
      external_actions_allowed = false,
      updated_at = now()
  returning id into v_manager_agent_id;

  if v_manager_agent_id is null then
    select a.id into v_manager_agent_id
    from public.agents a
    where a.organization_id = new.id
      and a.agent_code = 'RYTHM-COMMS'
    limit 1;
  end if;

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
    new.slug,
    v_domain,
    v_manager_agent_id,
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
    new.slug || '.' || v_domain,
    false,
    false,
    jsonb_build_object(
      'transport_state', 'provider_integration_pending',
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
    seed.local_part || '@' || new.slug || '.' || v_domain,
    seed.display_name,
    seed.purpose,
    'system',
    v_manager_agent_id,
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
      'managed_domain', new.slug || '.' || v_domain,
      'default_mailboxes', jsonb_build_array('contact','support','sales','finance','management'),
      'communication_manager_agent_id', v_manager_agent_id,
      'external_transport_enabled', false,
      'auto_send_enabled', false
    )
  );

  return new;
end;
$$;

revoke all on function public.provision_default_communication_workspace() from public, anon, authenticated;

drop trigger if exists organizations_provision_communication_workspace on public.organizations;
create trigger organizations_provision_communication_workspace
after insert on public.organizations
for each row execute function public.provision_default_communication_workspace();

-- Backfill the Communication Manager agent for organizations created before this migration.
insert into public.agents (
  organization_id,
  agent_code,
  name,
  role_title,
  purpose,
  authority_level,
  risk_ceiling,
  enabled,
  specification_version,
  identity,
  permissions,
  display_name,
  department,
  responsibilities,
  skills,
  human_approval_requirements,
  allowed_tools,
  external_actions_allowed,
  agent_status,
  system_instructions
)
select
  o.id,
  'RYTHM-COMMS',
  'Communication Manager',
  'Communication Manager',
  'Own company communication triage, classification, routing, summarization, follow-up coordination, and governed reply drafting.',
  2,
  'medium'::public.rythm_risk_level,
  true,
  '1.0',
  jsonb_build_object('system_role', 'communication_manager', 'human_governed', true),
  jsonb_build_object('communication', jsonb_build_object('read',true,'classify',true,'summarize',true,'assign',true,'draft',true,'send',false)),
  'Communication Manager',
  'Communications',
  jsonb_build_array('Monitor company communication','Classify and prioritize inbound messages','Assign conversations to the correct agent or department','Draft governed responses','Escalate consequential items to the Human CEO','Surface meeting and action follow-ups'),
  jsonb_build_array('email triage','routing','summarization','stakeholder communication'),
  jsonb_build_array('All external email sending requires human approval in the Communication MVP'),
  jsonb_build_array('communication_inbox','communication_routing','communication_drafts'),
  false,
  'enabled',
  'Never send an external message autonomously. Read, classify, summarize, route, and draft. Escalate legal, financial, contractual, security, urgent, or high-impact communication to the Human CEO for explicit approval.'
from public.organizations o
on conflict (organization_id, agent_code) do nothing;

insert into public.communication_settings (
  organization_id,
  managed_subdomain,
  managed_domain,
  communication_manager_agent_id,
  default_approval_mode,
  manager_escalation_priority,
  auto_send_enabled
)
select
  o.id,
  o.slug,
  'rythm-os.com',
  a.id,
  'approval_required',
  'high',
  false
from public.organizations o
join public.agents a
  on a.organization_id = o.id
 and a.agent_code = 'RYTHM-COMMS'
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
)
select
  o.id,
  'rythm_managed',
  'RYTHM Managed Email',
  'provisioned',
  o.slug || '.rythm-os.com',
  false,
  false,
  jsonb_build_object('transport_state','provider_integration_pending','mvp_policy','approval_required','credentials_stored',false)
from public.organizations o
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
  o.id,
  seed.local_part,
  seed.local_part || '@' || o.slug || '.rythm-os.com',
  seed.display_name,
  seed.purpose,
  'system',
  a.id,
  'approval_required',
  true
from public.organizations o
join public.agents a
  on a.organization_id = o.id
 and a.agent_code = 'RYTHM-COMMS'
cross join (values
  ('contact', 'Contact', 'General company enquiries'),
  ('support', 'Support', 'Customer support and service requests'),
  ('sales', 'Sales', 'Sales and commercial enquiries'),
  ('finance', 'Finance', 'Finance, billing, and payment communication'),
  ('management', 'Management', 'Executive and management communication')
) as seed(local_part, display_name, purpose)
on conflict (organization_id, local_part) do nothing;

comment on table public.communication_provider_connections is
  'Provider-neutral transport metadata. Secrets/tokens are intentionally not stored in this table.';
comment on column public.communication_settings.auto_send_enabled is
  'Fail-closed by default. Communication MVP does not enable autonomous external email sending.';
