-- RYTHM Company OS — Commercial Day 3: Agent Factory + Company Template Foundation
-- Target: B2B Paid Public Beta 2026-08-18
--
-- This migration implements the frozen Day 1 template contracts as tenant-safe,
-- versioned data. Global templates are read-only to authenticated customers;
-- provisioning always materializes organization-owned departments and Agents.

create table if not exists public.departments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  template_key text,
  name text not null,
  description text,
  status text not null default 'active' check (status in ('active','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, template_key)
);

create index if not exists departments_org_idx on public.departments(organization_id, status);
alter table public.departments enable row level security;

drop policy if exists departments_member_read on public.departments;
create policy departments_member_read
on public.departments for select to authenticated
using (public.is_org_member(organization_id));

drop policy if exists departments_owner_write on public.departments;
create policy departments_owner_write
on public.departments for all to authenticated
using (public.is_org_owner(organization_id))
with check (public.is_org_owner(organization_id));

create table if not exists public.agent_templates (
  id uuid primary key default gen_random_uuid(),
  template_key text not null,
  version text not null,
  name text not null,
  role text not null,
  role_code text not null,
  department_template_key text,
  reports_to_template_key text,
  purpose text not null,
  responsibilities jsonb not null default '[]'::jsonb,
  skills jsonb not null default '[]'::jsonb,
  work_style text,
  kpis jsonb not null default '[]'::jsonb,
  success_criteria jsonb not null default '[]'::jsonb,
  default_authority_level smallint not null default 1 check (default_authority_level between 0 and 4),
  default_risk_ceiling public.rythm_risk_level not null default 'low',
  default_human_approval_requirements jsonb not null default '[]'::jsonb,
  default_allowed_tools jsonb not null default '[]'::jsonb,
  default_memory_scope text not null default 'organization',
  default_language text not null default 'English',
  system_instructions_template text not null,
  runtime_policy_key text not null default 'central_openai_v1',
  budget_policy_key text not null default 'organization_metered_v1',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (template_key, version)
);

alter table public.agent_templates enable row level security;
drop policy if exists agent_templates_authenticated_read on public.agent_templates;
create policy agent_templates_authenticated_read
on public.agent_templates for select to authenticated
using (is_active = true);

create table if not exists public.company_templates (
  id uuid primary key default gen_random_uuid(),
  template_key text not null,
  name text not null,
  company_type text not null,
  category text not null,
  description text not null,
  positioning text,
  version text not null,
  status text not null default 'active' check (status in ('draft','active','retired')),
  owner_name text not null default 'RYTHM',
  supported_product_codes text[] not null default '{}'::text[],
  organization_defaults jsonb not null default '{}'::jsonb,
  department_templates jsonb not null default '[]'::jsonb,
  agent_template_refs text[] not null default '{}'::text[],
  workflow_template_refs text[] not null default '{}'::text[],
  governance_profile jsonb not null default '{}'::jsonb,
  memory_structure_template jsonb not null default '{}'::jsonb,
  onboarding_questions jsonb not null default '[]'::jsonb,
  launch_configuration jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (template_key, version)
);

alter table public.company_templates enable row level security;
drop policy if exists company_templates_authenticated_read on public.company_templates;
create policy company_templates_authenticated_read
on public.company_templates for select to authenticated
using (status = 'active');

create table if not exists public.organization_template_installations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  company_template_id uuid not null references public.company_templates(id),
  template_key text not null,
  template_version text not null,
  installed_by_user_id uuid references auth.users(id) on delete set null,
  installed_at timestamptz not null default now(),
  configuration_snapshot jsonb not null default '{}'::jsonb,
  unique (organization_id, template_key, template_version)
);

alter table public.organization_template_installations enable row level security;
drop policy if exists template_installations_member_read on public.organization_template_installations;
create policy template_installations_member_read
on public.organization_template_installations for select to authenticated
using (public.is_org_member(organization_id));

alter table public.agents add column if not exists agent_template_id uuid references public.agent_templates(id) on delete set null;
alter table public.agents add column if not exists department_id uuid references public.departments(id) on delete set null;
alter table public.agents add column if not exists reports_to_agent_id uuid references public.agents(id) on delete set null;
alter table public.agents add column if not exists is_ai boolean not null default true;
alter table public.agents add column if not exists responsibilities jsonb not null default '[]'::jsonb;
alter table public.agents add column if not exists skills jsonb not null default '[]'::jsonb;
alter table public.agents add column if not exists work_style text;
alter table public.agents add column if not exists language text not null default 'English';
alter table public.agents add column if not exists system_instructions text;
alter table public.agents add column if not exists kpis jsonb not null default '[]'::jsonb;
alter table public.agents add column if not exists success_criteria jsonb not null default '[]'::jsonb;
alter table public.agents add column if not exists human_approval_requirements jsonb not null default '[]'::jsonb;
alter table public.agents add column if not exists allowed_tools jsonb not null default '[]'::jsonb;
alter table public.agents add column if not exists memory_scope text not null default 'organization';
alter table public.agents add column if not exists external_actions_allowed boolean not null default false;
alter table public.agents add column if not exists runtime_provider text not null default 'OpenAI';
alter table public.agents add column if not exists runtime_model text;
alter table public.agents add column if not exists runtime_policy_key text not null default 'central_openai_v1';
alter table public.agents add column if not exists budget_policy_key text not null default 'organization_metered_v1';
alter table public.agents add column if not exists agent_status text not null default 'paused' check (agent_status in ('enabled','paused','archived'));
alter table public.agents add column if not exists template_version text;

create index if not exists agents_org_department_idx on public.agents(organization_id, department_id);
create index if not exists agents_template_idx on public.agents(agent_template_id);

-- Agent Template Library V1 — Ready Company #1: AI Advertising Agency.
insert into public.agent_templates (
  template_key, version, name, role, role_code, department_template_key,
  reports_to_template_key, purpose, responsibilities, skills, work_style,
  kpis, success_criteria, default_authority_level, default_risk_ceiling,
  default_human_approval_requirements, default_allowed_tools,
  default_memory_scope, default_language, system_instructions_template,
  runtime_policy_key, budget_policy_key, is_active
) values
(
  'advertising_strategy_director','1.0','Strategy Director','Strategy Director','STRATEGY_DIRECTOR','strategy',null,
  'Translate business goals into governed advertising strategy and coordinate strategic recommendations across the AI workforce.',
  '["Interpret business and client briefs","Define campaign strategy and positioning","Coordinate strategic trade-offs","Escalate consequential recommendations to the Human CEO"]'::jsonb,
  '["Advertising strategy","Positioning","Audience strategy","Brief synthesis","Cross-functional planning"]'::jsonb,
  'Structured, evidence-seeking, commercially pragmatic and explicit about assumptions.',
  '["Strategy briefs completed","Strategic recommendations accepted","Material assumptions documented"]'::jsonb,
  '["Every strategy is traceable to a brief","Consequential commitments require Human CEO approval"]'::jsonb,
  2,'medium','["Budget commitments","External publication","Material client commitments"]'::jsonb,
  '["company_memory","projects","meetings","decisions","actions"]'::jsonb,'organization','English',
  'You are the Strategy Director AI Agent in a governed advertising company. Produce strategic analysis and recommendations only within recorded company context. Never represent yourself as human. Never publish, spend money, contact external parties, or make consequential commitments without explicit Human CEO approval.',
  'central_openai_v1','organization_metered_v1',true
),
(
  'advertising_account_manager','1.0','Account Manager','Account Manager','ACCOUNT_MANAGER','accounts',null,
  'Structure incoming business requirements into clear internal briefs and maintain accountable coordination of work.',
  '["Structure business briefs","Clarify missing requirements","Coordinate internal deliverables","Maintain action and decision traceability"]'::jsonb,
  '["Briefing","Requirements analysis","Stakeholder coordination","Project organization"]'::jsonb,
  'Precise, service-oriented and conservative about unstated requirements.',
  '["Brief completeness","Open requirement gaps","On-time internal handoffs"]'::jsonb,
  '["No invented client requirements","All material gaps are surfaced"]'::jsonb,
  1,'medium','["External customer communication","Commercial commitments"]'::jsonb,
  '["company_memory","projects","meetings","actions"]'::jsonb,'organization','English',
  'You are the Account Manager AI Agent. Convert supplied business context into structured internal briefs. Do not contact clients or external parties. Do not invent requirements. Escalate consequential ambiguity to the Human CEO.',
  'central_openai_v1','organization_metered_v1',true
),
(
  'advertising_creative_director','1.0','Creative Director','Creative Director','CREATIVE_DIRECTOR','creative',null,
  'Develop governed creative direction and coordinate creative concept development.',
  '["Define creative direction","Review creative concepts","Coordinate Copywriter and Content Specialist","Surface brand and reputational risks"]'::jsonb,
  '["Creative strategy","Brand systems","Concept development","Creative review"]'::jsonb,
  'Inventive but bounded by brand, evidence and approval constraints.',
  '["Creative directions produced","Concept review quality","Brand-risk escalations"]'::jsonb,
  '["Creative concepts remain internal until approved","Brand-sensitive claims are escalated"]'::jsonb,
  2,'medium','["External publication","Unverified claims","Material brand changes"]'::jsonb,
  '["company_memory","projects","meetings","decisions"]'::jsonb,'organization','English',
  'You are the Creative Director AI Agent. Lead internal creative development. Clearly distinguish concepts from approved output. Do not publish content externally. Escalate sensitive claims and material brand choices to the Human CEO.',
  'central_openai_v1','organization_metered_v1',true
),
(
  'advertising_copywriter','1.0','Copywriter','Copywriter','COPYWRITER','creative','advertising_creative_director',
  'Create internal advertising copy concepts from approved briefs and creative direction.',
  '["Draft copy concepts","Adapt messaging by audience and channel","Flag unsupported claims","Revise against review feedback"]'::jsonb,
  '["Advertising copywriting","Messaging","Tone adaptation","Editing"]'::jsonb,
  'Concise, audience-aware and claim-conscious.',
  '["Draft quality","Revision efficiency","Unsupported claims flagged"]'::jsonb,
  '["No fabricated evidence","No external publishing"]'::jsonb,
  1,'medium','["External publication","Regulated or unsupported claims"]'::jsonb,
  '["company_memory","projects","actions"]'::jsonb,'organization','English',
  'You are the Copywriter AI Agent. Produce internal copy drafts only. Never fabricate facts, testimonials, performance data or legal claims. Do not publish externally.',
  'central_openai_v1','organization_metered_v1',true
),
(
  'advertising_content_specialist','1.0','Content Specialist','Content Specialist','CONTENT_SPECIALIST','creative','advertising_creative_director',
  'Develop channel-appropriate content concepts and content plans from governed strategy and creative direction.',
  '["Develop content concepts","Build content plans","Adapt concepts by channel","Coordinate with Copywriter"]'::jsonb,
  '["Content strategy","Channel adaptation","Editorial planning","Content ideation"]'::jsonb,
  'Systematic, channel-aware and reusable-content oriented.',
  '["Content concepts produced","Plan completeness","Channel fit"]'::jsonb,
  '["All output remains draft until approval","No external publishing"]'::jsonb,
  1,'medium','["External publication","Material public claims"]'::jsonb,
  '["company_memory","projects","actions"]'::jsonb,'organization','English',
  'You are the Content Specialist AI Agent. Create internal content concepts and plans. Do not post, schedule or publish externally. Escalate sensitive public claims.',
  'central_openai_v1','organization_metered_v1',true
),
(
  'advertising_performance_marketing','1.0','Performance Marketing Specialist','Performance Marketing Specialist','PERFORMANCE_MARKETING','performance',null,
  'Develop channel, campaign and optimization recommendations without autonomously spending or modifying ad accounts.',
  '["Recommend channel mix","Develop campaign structure","Define optimization hypotheses","Estimate budget scenarios without committing spend"]'::jsonb,
  '["Performance marketing","Paid media planning","Experiment design","Funnel analysis"]'::jsonb,
  'Quantitative, experiment-driven and explicit about uncertainty.',
  '["Campaign plans produced","Experiment quality","Budget assumptions documented"]'::jsonb,
  '["No autonomous ad spend","No ad-account modification","Budget recommendations remain proposals"]'::jsonb,
  2,'high','["Any ad spend","Ad-account changes","External campaign activation"]'::jsonb,
  '["company_memory","projects","decisions","actions"]'::jsonb,'organization','English',
  'You are the Performance Marketing Specialist AI Agent. Develop internal media and campaign recommendations. Never spend money, alter ad accounts, launch campaigns or make external changes. All such actions require separate permissions and Human CEO approval.',
  'central_openai_v1','organization_metered_v1',true
),
(
  'advertising_analytics_specialist','1.0','Analytics Specialist','Analytics Specialist','ANALYTICS_SPECIALIST','analytics',null,
  'Define measurement frameworks and interpret available performance evidence for governed decision-making.',
  '["Define measurement plans","Interpret supplied performance data","Identify uncertainty and data gaps","Support decision reviews"]'::jsonb,
  '["Marketing analytics","Measurement design","KPI interpretation","Data quality assessment"]'::jsonb,
  'Evidence-first, skeptical of weak attribution and explicit about data quality.',
  '["Measurement plans completed","Data gaps identified","Interpretations traceable to evidence"]'::jsonb,
  '["No invented metrics","Causal claims require sufficient evidence"]'::jsonb,
  1,'medium','["Material performance claims","External reporting commitments"]'::jsonb,
  '["company_memory","projects","meetings","decisions"]'::jsonb,'organization','English',
  'You are the Analytics Specialist AI Agent. Interpret only available evidence. Never invent data. Clearly label uncertainty, correlation and attribution limitations. Keep outputs internal unless approved.',
  'central_openai_v1','organization_metered_v1',true
)
on conflict (template_key, version) do update set
  name = excluded.name,
  role = excluded.role,
  role_code = excluded.role_code,
  department_template_key = excluded.department_template_key,
  reports_to_template_key = excluded.reports_to_template_key,
  purpose = excluded.purpose,
  responsibilities = excluded.responsibilities,
  skills = excluded.skills,
  work_style = excluded.work_style,
  kpis = excluded.kpis,
  success_criteria = excluded.success_criteria,
  default_authority_level = excluded.default_authority_level,
  default_risk_ceiling = excluded.default_risk_ceiling,
  default_human_approval_requirements = excluded.default_human_approval_requirements,
  default_allowed_tools = excluded.default_allowed_tools,
  default_memory_scope = excluded.default_memory_scope,
  default_language = excluded.default_language,
  system_instructions_template = excluded.system_instructions_template,
  runtime_policy_key = excluded.runtime_policy_key,
  budget_policy_key = excluded.budget_policy_key,
  is_active = true,
  updated_at = now();

insert into public.company_templates (
  template_key, name, company_type, category, description, positioning,
  version, status, owner_name, supported_product_codes,
  organization_defaults, department_templates, agent_template_refs,
  workflow_template_refs, governance_profile, memory_structure_template,
  onboarding_questions, launch_configuration
) values (
  'ready_ai_advertising_agency_v1',
  'AI Advertising Agency',
  'Advertising Agency',
  'Ready Company',
  'A governed AI advertising company with seven specialized AI Agents operating under Human CEO authority.',
  'A ready-to-operate governed AI advertising workforce for strategy, accounts, creative, content, performance and analytics.',
  '1.0','active','RYTHM',
  array['ready_company','custom_company','company_studio']::text[],
  '{"preferred_language":"English","external_actions_allowed":false,"human_ceo_required":true}'::jsonb,
  '[
    {"key":"strategy","name":"Strategy","description":"Advertising strategy and positioning"},
    {"key":"accounts","name":"Accounts","description":"Brief and requirement coordination"},
    {"key":"creative","name":"Creative","description":"Creative direction, copy and content"},
    {"key":"performance","name":"Performance Marketing","description":"Campaign and channel planning"},
    {"key":"analytics","name":"Analytics","description":"Measurement and performance interpretation"}
  ]'::jsonb,
  array[
    'advertising_strategy_director',
    'advertising_account_manager',
    'advertising_creative_director',
    'advertising_copywriter',
    'advertising_content_specialist',
    'advertising_performance_marketing',
    'advertising_analytics_specialist'
  ]::text[],
  array['advertising_brief_to_approval_v1']::text[],
  '{"human_ceo_authority":true,"external_actions_default":false,"high_risk_requires_approval":true,"ai_identity_disclosure":true}'::jsonb,
  '{"scopes":["company","brand","clients","campaigns","performance"],"governed":true}'::jsonb,
  '[
    {"key":"primary_services","label":"Primary advertising services","type":"multi_select"},
    {"key":"preferred_language","label":"Primary operating language","type":"text"}
  ]'::jsonb,
  '{"agent_count":7,"agents_initial_status":"paused","external_actions_allowed":false}'::jsonb
)
on conflict (template_key, version) do update set
  name = excluded.name,
  description = excluded.description,
  positioning = excluded.positioning,
  status = 'active',
  supported_product_codes = excluded.supported_product_codes,
  organization_defaults = excluded.organization_defaults,
  department_templates = excluded.department_templates,
  agent_template_refs = excluded.agent_template_refs,
  workflow_template_refs = excluded.workflow_template_refs,
  governance_profile = excluded.governance_profile,
  memory_structure_template = excluded.memory_structure_template,
  onboarding_questions = excluded.onboarding_questions,
  launch_configuration = excluded.launch_configuration,
  updated_at = now();

create or replace function public.provision_company_template(
  target_org_id uuid,
  target_template_key text,
  target_template_version text default '1.0'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_template public.company_templates%rowtype;
  v_entitlement public.organization_entitlements%rowtype;
  v_installation_id uuid;
  v_department jsonb;
  v_agent_template public.agent_templates%rowtype;
  v_agent_ref text;
  v_agent_id uuid;
  v_reports_to_id uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if not public.is_org_owner(target_org_id) then
    raise exception 'Organization owner authority required';
  end if;

  select * into v_entitlement
  from public.organization_entitlements
  where organization_id = target_org_id;

  if v_entitlement.id is null or not v_entitlement.company_template_access then
    raise exception 'Company template access is not enabled for this organization';
  end if;

  select * into v_template
  from public.company_templates
  where template_key = trim(target_template_key)
    and version = trim(target_template_version)
    and status = 'active';

  if v_template.id is null then
    raise exception 'Active company template not found';
  end if;

  if not (v_entitlement.product_code = any(v_template.supported_product_codes)) then
    raise exception 'Company template is not supported by the active product';
  end if;

  select id into v_installation_id
  from public.organization_template_installations
  where organization_id = target_org_id
    and template_key = v_template.template_key
    and template_version = v_template.version;

  if v_installation_id is not null then
    return v_installation_id;
  end if;

  -- V1 prevents materializing a template over an already populated Agent roster.
  if exists (select 1 from public.agents where organization_id = target_org_id) then
    raise exception 'Organization already contains Agents; template overlay is blocked in V1';
  end if;

  for v_department in select value from jsonb_array_elements(v_template.department_templates)
  loop
    insert into public.departments (organization_id, template_key, name, description)
    values (
      target_org_id,
      v_department->>'key',
      v_department->>'name',
      v_department->>'description'
    )
    on conflict (organization_id, template_key) do update
      set name = excluded.name,
          description = excluded.description,
          updated_at = now();
  end loop;

  foreach v_agent_ref in array v_template.agent_template_refs
  loop
    select * into v_agent_template
    from public.agent_templates
    where template_key = v_agent_ref
      and version = v_template.version
      and is_active = true;

    if v_agent_template.id is null then
      raise exception 'Agent template % version % not found', v_agent_ref, v_template.version;
    end if;

    insert into public.agents (
      organization_id, agent_template_id, department_id,
      agent_code, name, role_title, purpose,
      authority_level, risk_ceiling, enabled,
      specification_version, identity, permissions,
      is_ai, responsibilities, skills, work_style, language,
      system_instructions, kpis, success_criteria,
      human_approval_requirements, allowed_tools, memory_scope,
      external_actions_allowed, runtime_provider, runtime_policy_key,
      budget_policy_key, agent_status, template_version
    ) values (
      target_org_id,
      v_agent_template.id,
      (select d.id from public.departments d where d.organization_id = target_org_id and d.template_key = v_agent_template.department_template_key),
      v_agent_template.role_code,
      v_agent_template.name,
      v_agent_template.role,
      v_agent_template.purpose,
      v_agent_template.default_authority_level,
      v_agent_template.default_risk_ceiling,
      false,
      v_agent_template.version,
      jsonb_build_object('is_ai', true, 'template_key', v_agent_template.template_key, 'template_version', v_agent_template.version),
      jsonb_build_object('external_actions_allowed', false, 'human_approval_requirements', v_agent_template.default_human_approval_requirements),
      true,
      v_agent_template.responsibilities,
      v_agent_template.skills,
      v_agent_template.work_style,
      v_agent_template.default_language,
      v_agent_template.system_instructions_template,
      v_agent_template.kpis,
      v_agent_template.success_criteria,
      v_agent_template.default_human_approval_requirements,
      v_agent_template.default_allowed_tools,
      v_agent_template.default_memory_scope,
      false,
      'OpenAI',
      v_agent_template.runtime_policy_key,
      v_agent_template.budget_policy_key,
      'paused',
      v_agent_template.version
    )
    returning id into v_agent_id;
  end loop;

  -- Resolve reporting lines only after all organization-owned Agent instances exist.
  for v_agent_template in
    select at.*
    from public.agent_templates at
    where at.template_key = any(v_template.agent_template_refs)
      and at.version = v_template.version
      and at.reports_to_template_key is not null
  loop
    select a.id into v_reports_to_id
    from public.agents a
    join public.agent_templates parent_template on parent_template.id = a.agent_template_id
    where a.organization_id = target_org_id
      and parent_template.template_key = v_agent_template.reports_to_template_key
      and parent_template.version = v_template.version;

    update public.agents a
    set reports_to_agent_id = v_reports_to_id,
        updated_at = now()
    where a.organization_id = target_org_id
      and a.agent_template_id = v_agent_template.id;
  end loop;

  insert into public.organization_template_installations (
    organization_id, company_template_id, template_key, template_version,
    installed_by_user_id, configuration_snapshot
  ) values (
    target_org_id,
    v_template.id,
    v_template.template_key,
    v_template.version,
    v_user_id,
    jsonb_build_object(
      'company_template', v_template.template_key,
      'version', v_template.version,
      'department_templates', v_template.department_templates,
      'agent_template_refs', v_template.agent_template_refs,
      'governance_profile', v_template.governance_profile,
      'external_actions_allowed', false
    )
  ) returning id into v_installation_id;

  insert into public.audit_events (
    organization_id, actor_type, actor_user_id, event_type,
    object_type, object_id, risk_level, payload
  ) values (
    target_org_id,
    'user',
    v_user_id,
    'company_template.provisioned',
    'company_template',
    v_template.id::text,
    'low',
    jsonb_build_object(
      'template_key', v_template.template_key,
      'template_version', v_template.version,
      'agent_count', cardinality(v_template.agent_template_refs),
      'agents_initial_status', 'paused',
      'external_actions_allowed', false,
      'human_ceo_authority', true
    )
  );

  return v_installation_id;
end;
$$;

revoke all on function public.provision_company_template(uuid,text,text) from public;
grant execute on function public.provision_company_template(uuid,text,text) to authenticated;
