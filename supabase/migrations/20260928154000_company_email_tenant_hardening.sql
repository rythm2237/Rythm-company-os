-- Company email identity + multi-tenant isolation hardening.
--
-- Goals:
-- 1. Every customer organization owns a unique, human-readable email namespace.
-- 2. New organizations automatically receive a primary mailbox plus departmental mailboxes.
-- 3. Email addresses are globally unique, including case-insensitive comparisons.
-- 4. Tenant-owned agent/department relationships cannot cross organization boundaries,
--    even when a privileged service path is used.
-- 5. Communication triage uses only valid thread priorities.
-- 6. Trigger-only SECURITY DEFINER helpers are not callable through the public API.

-- ---------------------------------------------------------------------------
-- Preflight: current data must already respect tenant boundaries.
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (
    select 1 from public.agents a
    join public.departments d on d.id = a.department_id
    where a.department_id is not null and a.organization_id <> d.organization_id
  ) then raise exception 'Cross-tenant agent.department_id relationship detected'; end if;

  if exists (
    select 1 from public.agents a
    join public.agents p on p.id = a.reports_to_agent_id
    where a.reports_to_agent_id is not null and a.organization_id <> p.organization_id
  ) then raise exception 'Cross-tenant agent.reports_to_agent_id relationship detected'; end if;

  if exists (
    select 1 from public.departments d
    join public.agents a on a.id = d.manager_agent_id
    where d.manager_agent_id is not null and d.organization_id <> a.organization_id
  ) then raise exception 'Cross-tenant department.manager_agent_id relationship detected'; end if;

  if exists (
    select 1 from public.departments d
    join public.departments p on p.id = d.parent_department_id
    where d.parent_department_id is not null and d.organization_id <> p.organization_id
  ) then raise exception 'Cross-tenant department.parent_department_id relationship detected'; end if;

  if exists (
    select 1 from public.communication_mailboxes
    group by lower(address)
    having count(*) > 1
  ) then raise exception 'Duplicate communication mailbox address detected'; end if;
end $$;

-- ---------------------------------------------------------------------------
-- Global identity uniqueness.
-- ---------------------------------------------------------------------------
create unique index if not exists communication_mailboxes_lower_address_uidx
  on public.communication_mailboxes (lower(address));

create unique index if not exists organizations_lower_primary_email_uidx
  on public.organizations (lower(primary_email))
  where primary_email is not null;

-- ---------------------------------------------------------------------------
-- Tenant-safe composite relationships.
-- Existing simple foreign keys remain for compatibility; the composite keys add
-- the invariant that both records must belong to the same organization.
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.agents'::regclass
      and conname = 'agents_organization_id_id_key'
  ) then
    alter table public.agents
      add constraint agents_organization_id_id_key unique (organization_id, id);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.departments'::regclass
      and conname = 'departments_organization_id_id_key'
  ) then
    alter table public.departments
      add constraint departments_organization_id_id_key unique (organization_id, id);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.agents'::regclass
      and conname = 'agents_organization_department_tenant_fkey'
  ) then
    alter table public.agents
      add constraint agents_organization_department_tenant_fkey
      foreign key (organization_id, department_id)
      references public.departments (organization_id, id)
      on delete set null
      not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.agents'::regclass
      and conname = 'agents_organization_reports_to_tenant_fkey'
  ) then
    alter table public.agents
      add constraint agents_organization_reports_to_tenant_fkey
      foreign key (organization_id, reports_to_agent_id)
      references public.agents (organization_id, id)
      on delete set null
      not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.departments'::regclass
      and conname = 'departments_organization_manager_tenant_fkey'
  ) then
    alter table public.departments
      add constraint departments_organization_manager_tenant_fkey
      foreign key (organization_id, manager_agent_id)
      references public.agents (organization_id, id)
      on delete set null
      not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.departments'::regclass
      and conname = 'departments_organization_parent_tenant_fkey'
  ) then
    alter table public.departments
      add constraint departments_organization_parent_tenant_fkey
      foreign key (organization_id, parent_department_id)
      references public.departments (organization_id, id)
      on delete set null
      not valid;
  end if;
end $$;

alter table public.agents validate constraint agents_organization_department_tenant_fkey;
alter table public.agents validate constraint agents_organization_reports_to_tenant_fkey;
alter table public.departments validate constraint departments_organization_manager_tenant_fkey;
alter table public.departments validate constraint departments_organization_parent_tenant_fkey;

-- ---------------------------------------------------------------------------
-- Race-safe organization email namespace allocation.
-- Customer provisioning already derives the slug from the chosen company name;
-- this trigger serializes identical slug claims and guarantees a unique namespace.
-- Example: Donya -> donya@rythm-os.com and support.donya@rythm-os.com.
-- A later company choosing the same name receives a safe suffix (donya-1, ...).
-- ---------------------------------------------------------------------------
create or replace function public.allocate_organization_email_identity_v1()
returns trigger
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_base text;
  v_candidate text;
  v_suffix integer := 0;
begin
  v_base := lower(regexp_replace(coalesce(nullif(trim(new.slug), ''), new.name), '[^a-zA-Z0-9]+', '-', 'g'));
  v_base := trim(both '-' from v_base);
  if v_base = '' then v_base := 'company'; end if;
  v_base := left(v_base, 48);

  perform pg_advisory_xact_lock(hashtext(v_base));
  v_candidate := v_base;
  while exists (select 1 from public.organizations o where o.slug = v_candidate) loop
    v_suffix := v_suffix + 1;
    v_candidate := left(v_base, 42) || '-' || v_suffix::text;
  end loop;

  new.slug := v_candidate;
  new.primary_email := v_candidate || '@rythm-os.com';
  return new;
end;
$$;

revoke all on function public.allocate_organization_email_identity_v1() from public, anon, authenticated;
grant execute on function public.allocate_organization_email_identity_v1() to service_role;

drop trigger if exists organizations_allocate_email_identity_v1 on public.organizations;
create trigger organizations_allocate_email_identity_v1
before insert on public.organizations
for each row
execute function public.allocate_organization_email_identity_v1();

-- ---------------------------------------------------------------------------
-- Automatic communication workspace. The primary address is the bare tenant
-- namespace; departmental mailboxes are prefixed with their function.
-- ---------------------------------------------------------------------------
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
    new.id, 'rythm_managed', 'RYTHM Managed Email', 'provisioned', v_transport_domain,
    true, false,
    jsonb_build_object(
      'outbound_provider', 'resend',
      'inbound_provider', 'cloudflare_email_worker',
      'addressing_model', 'tenant@rythm-os.com + department.tenant@rythm-os.com',
      'transport_state', 'domain_verified_runtime_secret_required',
      'mvp_policy', 'approval_required',
      'credentials_stored', false,
      'sending_domain_verified', true
    )
  ) on conflict (organization_id, provider_code) do update set
    external_domain = excluded.external_domain,
    inbound_enabled = true,
    metadata = coalesce(public.communication_provider_connections.metadata, '{}'::jsonb) || excluded.metadata,
    updated_at = now();

  -- Primary/general company address: donya@rythm-os.com
  insert into public.communication_mailboxes (
    organization_id, local_part, address, display_name, purpose, mailbox_type,
    assigned_agent_id, approval_mode, is_active
  ) values (
    new.id, 'general', new.slug || '@' || v_transport_domain,
    'General', 'Primary company enquiries', 'system', null, 'approval_required', true
  ) on conflict (organization_id, local_part) do nothing;

  -- Functional mailboxes: support.donya@..., sales.donya@..., etc.
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
      'outbound_transport_enabled', false,
      'outbound_runtime_secret_required', true
    )
  );
  return new;
end;
$$;

revoke all on function public.provision_default_communication_workspace() from public, anon, authenticated;
grant execute on function public.provision_default_communication_workspace() to service_role;

-- Backfill the new primary/general identity for existing organizations without
-- changing their established tenant slug or departmental addresses.
insert into public.communication_mailboxes (
  organization_id, local_part, address, display_name, purpose, mailbox_type,
  assigned_agent_id, approval_mode, is_active
)
select o.id, 'general', o.slug || '@rythm-os.com', 'General', 'Primary company enquiries',
       'system', cs.communication_manager_agent_id, 'approval_required', true
from public.organizations o
left join public.communication_settings cs on cs.organization_id = o.id
where not exists (
  select 1 from public.communication_mailboxes m
  where m.organization_id = o.id and m.local_part = 'general'
)
on conflict (organization_id, local_part) do nothing;

update public.organizations o
set primary_email = o.slug || '@rythm-os.com', updated_at = now()
where o.primary_email is distinct from o.slug || '@rythm-os.com';

update public.communication_provider_connections c
set metadata = coalesce(c.metadata, '{}'::jsonb) || jsonb_build_object(
      'outbound_provider', 'resend',
      'sending_domain_verified', true,
      'addressing_model', 'tenant@rythm-os.com + department.tenant@rythm-os.com',
      'transport_state', case when c.outbound_enabled then 'connected' else 'domain_verified_runtime_secret_required' end
    ),
    updated_at = now()
where c.provider_code = 'rythm_managed';

-- ---------------------------------------------------------------------------
-- Communication triage bug fix: thread priority accepts low/normal/high/urgent,
-- so medium-risk communication maps to the valid thread priority `normal`.
-- Risk remains `medium` for governance/action routing.
-- ---------------------------------------------------------------------------
create or replace function public.communication_runtime_triage()
returns trigger
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_thread public.communication_threads%rowtype;
  v_mailbox public.communication_mailboxes%rowtype;
  v_agent_id uuid;
  v_owner_id uuid;
  v_text text;
  v_category text;
  v_priority text := 'normal';
  v_risk public.rythm_risk_level := 'low';
  v_attention boolean := false;
  v_action_id uuid;
  v_draft_body text;
begin
  if new.direction <> 'inbound' then return new; end if;

  select * into v_thread
  from public.communication_threads
  where id = new.thread_id and organization_id = new.organization_id;
  if not found then return new; end if;

  select * into v_mailbox
  from public.communication_mailboxes
  where id = new.mailbox_id and organization_id = new.organization_id;
  if not found then return new; end if;

  select communication_manager_agent_id into v_agent_id
  from public.communication_settings
  where organization_id = new.organization_id;
  if v_agent_id is null then v_agent_id := v_thread.assigned_agent_id; end if;

  select user_id into v_owner_id
  from public.organization_members
  where organization_id = new.organization_id
    and role = 'owner'
    and membership_status = 'active'
  order by created_at
  limit 1;

  v_text := lower(coalesce(new.subject,'') || ' ' || coalesce(new.body_text,''));
  v_category := case
    when coalesce(v_mailbox.local_part,'') = 'general' then 'General'
    else coalesce(initcap(v_mailbox.local_part), 'General')
  end;

  if v_text ~ '(security|breach|phishing|fraud|legal|lawyer|lawsuit|contract|invoice dispute|payment failed|chargeback|refund|urgent|critical|complaint|gdpr|privacy|data request)' then
    v_priority := 'high';
    v_risk := 'high';
    v_attention := true;
  elsif coalesce(v_mailbox.local_part,'') in ('support','sales','finance','management')
     or v_text ~ '(help|issue|problem|demo|pricing|quote|meeting|partnership|billing|invoice|payment|cancel|subscription)' then
    v_priority := 'normal';
    v_risk := 'medium';
    v_attention := coalesce(v_mailbox.local_part,'') in ('finance','management');
  end if;

  update public.communication_threads
  set category = v_category,
      priority = v_priority,
      assigned_agent_id = coalesce(v_agent_id, assigned_agent_id),
      requires_manager_attention = v_attention,
      manager_attention_reason = case when v_attention then 'Communication Manager escalation policy' else null end,
      ai_summary = left('Inbound ' || v_category || ' message from ' || coalesce(new.sender_email,'unknown sender') || ': ' || coalesce(new.subject,'(no subject)'), 500),
      updated_at = now()
  where id = new.thread_id and organization_id = new.organization_id;

  if coalesce(new.sender_email,'') !~* '(no-?reply|noreply|mailer-daemon)' then
    if v_category = 'Support' then
      v_draft_body := 'Thank you for contacting our Support team. We received your message and it is being reviewed by our Communication Manager. We will respond after the appropriate review.';
    elsif v_category = 'Sales' then
      v_draft_body := 'Thank you for contacting us. We received your commercial enquiry and our Communication Manager is reviewing it. We will follow up shortly.';
    elsif v_category = 'Finance' then
      v_draft_body := 'Thank you for your message. We received your finance-related enquiry and it has been routed for internal review before a response is sent.';
    else
      v_draft_body := 'Thank you for contacting us. We received your message and it is being reviewed by our Communication Manager. We will follow up as appropriate.';
    end if;

    insert into public.communication_messages(
      organization_id, thread_id, mailbox_id, direction, status, sender_email,
      recipients, subject, body_text, drafted_by_agent_id, reply_to_message_id, transport_source
    ) values (
      new.organization_id, new.thread_id, new.mailbox_id, 'outbound', 'draft', v_mailbox.address,
      jsonb_build_array(new.sender_email),
      case when coalesce(new.subject,'') ~* '^re:' then new.subject else 'Re: ' || coalesce(new.subject,'') end,
      v_draft_body, v_agent_id, new.id, 'communication_manager'
    ) on conflict do nothing;
  end if;

  if v_risk in ('medium','high','critical') and v_thread.related_action_item_id is null then
    insert into public.action_items(
      organization_id, title, description, status, priority, assigned_agent_id,
      assigned_user_id, due_at, action_code, owner_label, risk_level, handoff_source
    ) values (
      new.organization_id,
      'Review communication: ' || left(coalesce(new.subject,'(no subject)'),120),
      'Communication Manager follow-up for ' || coalesce(new.sender_email,'unknown sender'),
      'open', case when v_priority in ('high','urgent') then 5 else 3 end,
      v_agent_id, case when v_attention then v_owner_id else null end,
      now() + case when v_priority in ('high','urgent') then interval '4 hours' else interval '1 day' end,
      'COMM-' || left(new.thread_id::text,8), 'Communication Manager', v_risk::text, 'manual'
    ) returning id into v_action_id;

    update public.communication_threads
    set related_action_item_id = v_action_id
    where id = new.thread_id and organization_id = new.organization_id;
  end if;

  if v_attention and v_owner_id is not null then
    insert into public.approval_requests(
      organization_id, subject_type, subject_id, title, summary, risk_level,
      requested_by_agent_id, approver_user_id, status, conditions, expires_at,
      execution_expected_impact, execution_reversibility, execution_target,
      execution_tool, execution_operation, attention_tier, decision_group
    ) values (
      new.organization_id, 'communication_thread', new.thread_id,
      'Communication requires executive review',
      left(coalesce(new.subject,'(no subject)') || ' — ' || coalesce(new.sender_email,''),300),
      v_risk, v_agent_id, v_owner_id, 'pending',
      jsonb_build_object('external_send_requires_approval',true,'thread_id',new.thread_id),
      now() + interval '48 hours', 'External company communication', 'reversible',
      coalesce(new.sender_email,''), 'communication', 'approve_reply', 'executive', 'communications'
    );

    insert into public.notifications(
      organization_id, user_id, category, severity, title, body, action_url,
      source_type, source_id, dedupe_key, delivery_status
    ) values (
      new.organization_id, v_owner_id, 'communication',
      case when v_risk in ('high','critical') then 'critical' else 'warning' end,
      'Communication needs your attention',
      left(coalesce(new.subject,'(no subject)') || ' — from ' || coalesce(new.sender_email,'unknown sender'),300),
      '/communication?view=approvals', 'communication_thread', new.thread_id,
      'communication-attention-' || new.thread_id::text, 'pending'
    ) on conflict (organization_id,user_id,dedupe_key)
      where dedupe_key is not null do nothing;
  end if;

  return new;
end;
$$;

revoke all on function public.communication_runtime_triage() from public, anon, authenticated;
grant execute on function public.communication_runtime_triage() to service_role;
