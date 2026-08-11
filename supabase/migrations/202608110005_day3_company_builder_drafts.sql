-- RYTHM Company OS — Commercial Day 3: Company Studio Builder Drafts
-- Draft proposals are non-operational until explicit BUILD MY COMPANY confirmation.

create table if not exists public.company_builder_drafts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  created_by_user_id uuid not null references auth.users(id) on delete cascade,
  company_name text not null,
  company_type text not null,
  primary_services jsonb not null default '[]'::jsonb,
  business_model text not null,
  company_size_intent text not null,
  required_capabilities jsonb not null default '[]'::jsonb,
  desired_ai_authority smallint not null default 1 check (desired_ai_authority between 0 and 4),
  preferred_language text not null default 'English',
  proposed_structure jsonb not null default '{"departments":[],"agents":[]}'::jsonb,
  status text not null default 'draft' check (status in ('draft','reviewed','built','cancelled')),
  built_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists company_builder_drafts_org_idx
  on public.company_builder_drafts(organization_id, created_at desc);

alter table public.company_builder_drafts enable row level security;

drop policy if exists company_builder_drafts_owner_read on public.company_builder_drafts;
create policy company_builder_drafts_owner_read
on public.company_builder_drafts for select to authenticated
using (public.is_org_owner(organization_id));

drop policy if exists company_builder_drafts_owner_insert on public.company_builder_drafts;
create policy company_builder_drafts_owner_insert
on public.company_builder_drafts for insert to authenticated
with check (public.is_org_owner(organization_id) and created_by_user_id = auth.uid());

drop policy if exists company_builder_drafts_owner_update on public.company_builder_drafts;
create policy company_builder_drafts_owner_update
on public.company_builder_drafts for update to authenticated
using (public.is_org_owner(organization_id))
with check (public.is_org_owner(organization_id));

create or replace function public.build_company_from_draft(target_draft_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_draft public.company_builder_drafts%rowtype;
  v_entitlement public.organization_entitlements%rowtype;
  v_department jsonb;
  v_agent jsonb;
  v_department_count integer := 0;
  v_agent_count integer := 0;
  v_agent_code text;
  v_status text := 'paused';
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  select * into v_draft
  from public.company_builder_drafts
  where id = target_draft_id;

  if v_draft.id is null then
    raise exception 'Builder draft not found';
  end if;

  if not public.is_org_owner(v_draft.organization_id) then
    raise exception 'Organization owner authority required';
  end if;

  select * into v_entitlement
  from public.organization_entitlements
  where organization_id = v_draft.organization_id;

  if v_entitlement.id is null or not v_entitlement.company_builder_enabled then
    raise exception 'Company Builder is not enabled for this organization';
  end if;

  if v_draft.status = 'built' then
    return jsonb_build_object('draft_id', v_draft.id, 'status', 'built', 'already_built', true);
  end if;

  if v_draft.status not in ('draft','reviewed') then
    raise exception 'Builder draft is not buildable';
  end if;

  if exists (select 1 from public.agents where organization_id = v_draft.organization_id) then
    raise exception 'Organization already contains Agents; Builder overlay is blocked in V1';
  end if;

  if jsonb_array_length(coalesce(v_draft.proposed_structure->'departments','[]'::jsonb)) > v_entitlement.max_departments then
    raise exception 'Proposed department count exceeds entitlement';
  end if;

  if jsonb_array_length(coalesce(v_draft.proposed_structure->'agents','[]'::jsonb)) > v_entitlement.max_active_agents then
    raise exception 'Proposed Agent count exceeds entitlement';
  end if;

  update public.organizations
  set name = v_draft.company_name,
      updated_at = now()
  where id = v_draft.organization_id;

  for v_department in
    select value from jsonb_array_elements(coalesce(v_draft.proposed_structure->'departments','[]'::jsonb))
  loop
    insert into public.departments (
      organization_id, template_key, name, description
    ) values (
      v_draft.organization_id,
      coalesce(nullif(v_department->>'key',''), lower(regexp_replace(v_department->>'name','[^a-zA-Z0-9]+','_','g'))),
      v_department->>'name',
      v_department->>'description'
    )
    on conflict (organization_id, template_key) do update
      set name = excluded.name,
          description = excluded.description,
          updated_at = now();
    v_department_count := v_department_count + 1;
  end loop;

  for v_agent in
    select value from jsonb_array_elements(coalesce(v_draft.proposed_structure->'agents','[]'::jsonb))
  loop
    v_agent_code := upper(regexp_replace(coalesce(v_agent->>'role_code', v_agent->>'role'), '[^a-zA-Z0-9]+', '_', 'g'));

    insert into public.agents (
      organization_id,
      department_id,
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
      is_ai,
      responsibilities,
      skills,
      work_style,
      language,
      system_instructions,
      kpis,
      success_criteria,
      human_approval_requirements,
      allowed_tools,
      memory_scope,
      external_actions_allowed,
      runtime_provider,
      runtime_policy_key,
      budget_policy_key,
      agent_status,
      template_version
    ) values (
      v_draft.organization_id,
      (select d.id from public.departments d
        where d.organization_id = v_draft.organization_id
          and d.template_key = v_agent->>'department_key'
        limit 1),
      v_agent_code,
      coalesce(nullif(v_agent->>'name',''), v_agent->>'role'),
      v_agent->>'role',
      coalesce(v_agent->>'purpose', 'Support the organization within the Human CEO governed operating model.'),
      least(greatest(coalesce((v_agent->>'authority_level')::smallint, v_draft.desired_ai_authority),0),4),
      case coalesce(v_agent->>'risk_ceiling','medium')
        when 'low' then 'low'::public.rythm_risk_level
        when 'high' then 'high'::public.rythm_risk_level
        when 'critical' then 'critical'::public.rythm_risk_level
        else 'medium'::public.rythm_risk_level
      end,
      false,
      '1.0',
      jsonb_build_object('is_ai', true, 'builder_draft_id', v_draft.id),
      jsonb_build_object('external_actions_allowed', false, 'human_ceo_governed', true),
      true,
      coalesce(v_agent->'responsibilities','[]'::jsonb),
      coalesce(v_agent->'skills','[]'::jsonb),
      coalesce(v_agent->>'work_style','Structured, evidence-seeking and explicit about assumptions.'),
      v_draft.preferred_language,
      coalesce(v_agent->>'system_instructions',
        'You are an AI Agent in a RYTHM governed company. You must identify yourself as AI, operate only within company context, keep external actions disabled, and escalate consequential decisions to the Human CEO.'),
      coalesce(v_agent->'kpis','[]'::jsonb),
      coalesce(v_agent->'success_criteria','[]'::jsonb),
      coalesce(v_agent->'human_approval_requirements','["Consequential external actions","Material financial commitments"]'::jsonb),
      coalesce(v_agent->'allowed_tools','["company_memory","projects","meetings","decisions","actions"]'::jsonb),
      'organization',
      false,
      'OpenAI',
      'central_openai_v1',
      'organization_metered_v1',
      v_status,
      'builder-v1'
    );
    v_agent_count := v_agent_count + 1;
  end loop;

  update public.company_builder_drafts
  set status = 'built',
      built_at = now(),
      updated_at = now()
  where id = v_draft.id;

  insert into public.audit_events (
    organization_id, actor_type, actor_user_id, event_type,
    object_type, object_id, risk_level, payload
  ) values (
    v_draft.organization_id,
    'user',
    v_user_id,
    'company_builder.company_built',
    'company_builder_draft',
    v_draft.id::text,
    'medium',
    jsonb_build_object(
      'departments_created', v_department_count,
      'agents_created', v_agent_count,
      'agents_initial_status', v_status,
      'external_actions_allowed', false,
      'human_ceo_authority', true
    )
  );

  return jsonb_build_object(
    'draft_id', v_draft.id,
    'status', 'built',
    'departments_created', v_department_count,
    'agents_created', v_agent_count,
    'agents_initial_status', v_status
  );
end;
$$;

revoke all on function public.build_company_from_draft(uuid) from public;
grant execute on function public.build_company_from_draft(uuid) to authenticated;
