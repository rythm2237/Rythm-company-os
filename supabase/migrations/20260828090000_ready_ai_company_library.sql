-- RYTHM OS — Phase 4: Ready AI Company Library
-- Additive catalog/versioning layer. Preserves tenant ownership, Human CEO authority,
-- paused-by-default Agents, least privilege, and Phase 1–3 execution governance.

begin;

alter table public.company_templates
  add column if not exists catalog_slug text,
  add column if not exists display_order integer not null default 100,
  add column if not exists industry_tags text[] not null default '{}'::text[],
  add column if not exists recommended_for text[] not null default '{}'::text[],
  add column if not exists maturity text not null default 'stable'
    check (maturity in ('preview','stable','retired')),
  add column if not exists is_featured boolean not null default false,
  add column if not exists supersedes_version text,
  add column if not exists compatibility_contract jsonb not null default '{}'::jsonb,
  add column if not exists upgrade_strategy text not null default 'manual_review'
    check (upgrade_strategy in ('manual_review','optional_in_place','new_install_only'));

create unique index if not exists company_templates_catalog_slug_version_uidx
  on public.company_templates(catalog_slug, version)
  where catalog_slug is not null;
create index if not exists company_templates_catalog_order_idx
  on public.company_templates(status, maturity, display_order, name);

alter table public.organization_template_installations
  add column if not exists template_snapshot jsonb,
  add column if not exists template_snapshot_digest text,
  add column if not exists source_template_version text,
  add column if not exists upgrade_status text not null default 'current'
    check (upgrade_status in ('current','upgrade_available','upgrade_planned','superseded'));

create or replace function public.capture_company_template_installation_snapshot_v1()
returns trigger
language plpgsql
set search_path=public,extensions
as $$
declare
  v_template public.company_templates%rowtype;
  v_snapshot jsonb;
begin
  select * into v_template
  from public.company_templates
  where id=new.company_template_id
    and template_key=new.template_key
    and version=new.template_version;

  if v_template.id is null then
    raise exception 'Company template snapshot source is unavailable';
  end if;

  select jsonb_build_object(
    'schema_version', 1,
    'captured_at', now(),
    'company_template', to_jsonb(v_template),
    'agent_templates', coalesce((
      select jsonb_agg(to_jsonb(at) order by at.template_key)
      from public.agent_templates at
      where at.template_key=any(v_template.agent_template_refs)
        and at.version=v_template.version
    ), '[]'::jsonb),
    'workflows', coalesce((
      select jsonb_agg(to_jsonb(w) order by w.workflow_key)
      from public.company_template_workflows w
      where w.workflow_key=any(v_template.workflow_template_refs)
        and w.active=true
    ), '[]'::jsonb),
    'meeting_types', coalesce((
      select jsonb_agg(to_jsonb(m) order by m.meeting_key)
      from public.company_template_meeting_types m
      where m.company_template_key=v_template.template_key and m.active=true
    ), '[]'::jsonb),
    'integration_requirements', coalesce((
      select jsonb_agg(to_jsonb(r) order by r.provider_key)
      from public.company_template_integration_requirements r
      where r.company_template_key=v_template.template_key
    ), '[]'::jsonb),
    'integration_profiles', coalesce((
      select jsonb_agg(to_jsonb(p) order by p.agent_template_key,p.provider_key,p.capability_key)
      from public.company_template_integration_profiles p
      where p.company_template_key=v_template.template_key
    ), '[]'::jsonb)
  ) into v_snapshot;

  new.template_snapshot:=v_snapshot;
  new.template_snapshot_digest:=encode(extensions.digest(convert_to(v_snapshot::text,'UTF8'),'sha256'),'hex');
  new.source_template_version:=new.template_version;
  return new;
end $$;

create or replace function public.preserve_company_template_installation_snapshot_v1()
returns trigger
language plpgsql
set search_path=public
as $$
begin
  -- Existing pre-Phase-4 rows are allowed exactly one null -> captured snapshot
  -- transition during migration backfill. Once populated, snapshot identity is immutable.
  if old.template_snapshot is not null and (
       new.template_snapshot is distinct from old.template_snapshot
       or new.template_snapshot_digest is distinct from old.template_snapshot_digest
       or new.source_template_version is distinct from old.source_template_version
     ) then
    raise exception 'Installed company template snapshots are immutable';
  end if;
  return new;
end $$;

drop trigger if exists capture_company_template_installation_snapshot_v1 on public.organization_template_installations;
create trigger capture_company_template_installation_snapshot_v1
before insert on public.organization_template_installations
for each row execute function public.capture_company_template_installation_snapshot_v1();

drop trigger if exists preserve_company_template_installation_snapshot_v1 on public.organization_template_installations;
create trigger preserve_company_template_installation_snapshot_v1
before update on public.organization_template_installations
for each row execute function public.preserve_company_template_installation_snapshot_v1();

-- Backfill immutable snapshots for existing installations without rewriting any
-- existing configuration snapshot or tenant-owned Agent instance.
with snapshot_rows as (
  select i.id,
    jsonb_build_object(
      'schema_version',1,
      'captured_at',i.installed_at,
      'company_template',to_jsonb(t),
      'agent_templates',coalesce((select jsonb_agg(to_jsonb(at) order by at.template_key) from public.agent_templates at where at.template_key=any(t.agent_template_refs) and at.version=t.version),'[]'::jsonb),
      'workflows',coalesce((select jsonb_agg(to_jsonb(w) order by w.workflow_key) from public.company_template_workflows w where w.workflow_key=any(t.workflow_template_refs) and w.active=true),'[]'::jsonb),
      'meeting_types',coalesce((select jsonb_agg(to_jsonb(m) order by m.meeting_key) from public.company_template_meeting_types m where m.company_template_key=t.template_key and m.active=true),'[]'::jsonb),
      'integration_requirements',coalesce((select jsonb_agg(to_jsonb(r) order by r.provider_key) from public.company_template_integration_requirements r where r.company_template_key=t.template_key),'[]'::jsonb),
      'integration_profiles',coalesce((select jsonb_agg(to_jsonb(p) order by p.agent_template_key,p.provider_key,p.capability_key) from public.company_template_integration_profiles p where p.company_template_key=t.template_key),'[]'::jsonb)
    ) snapshot
  from public.organization_template_installations i
  join public.company_templates t on t.id=i.company_template_id
  where i.template_snapshot is null
)
update public.organization_template_installations i
set template_snapshot=s.snapshot,
    template_snapshot_digest=encode(extensions.digest(convert_to(s.snapshot::text,'UTF8'),'sha256'),'hex'),
    source_template_version=i.template_version
from snapshot_rows s where s.id=i.id;

-- Catalog metadata for existing ready companies.
update public.company_templates set
  catalog_slug='ai-advertising-agency',display_order=20,
  industry_tags=array['advertising','marketing','creative'],
  recommended_for=array['agencies','campaign teams','brand operations'],
  maturity='stable',is_featured=false,
  compatibility_contract='{"snapshot_isolation":true,"human_ceo_authority":true,"external_actions_default":false,"upgrade_requires_review":true}'::jsonb,
  upgrade_strategy='manual_review'
where template_key='ready_ai_advertising_agency_v1' and version='1.0';

update public.company_templates set
  catalog_slug='software-company',display_order=30,
  industry_tags=array['software','saas','technology'],
  recommended_for=array['software studios','mature product teams','technical founders'],
  maturity='stable',is_featured=false,
  compatibility_contract='{"snapshot_isolation":true,"human_ceo_authority":true,"external_actions_default":false,"upgrade_requires_review":true}'::jsonb,
  upgrade_strategy='manual_review'
where template_key='ready_software_company_v1' and version='1.0';

-- Phase 4 reference company: a 10-Agent SaaS startup that fits Ready Company
-- entitlement capacity while reusing the verified Software Company foundations.
insert into public.company_templates (
  template_key,name,company_type,category,description,positioning,version,status,owner_name,
  supported_product_codes,organization_defaults,department_templates,agent_template_refs,
  workflow_template_refs,governance_profile,memory_structure_template,onboarding_questions,launch_configuration,
  catalog_slug,display_order,industry_tags,recommended_for,maturity,is_featured,compatibility_contract,upgrade_strategy
) values (
  'ready_saas_startup_v1','SaaS Startup','saas_startup','Ready Companies',
  'A lean, governed AI SaaS company for discovery, product delivery, engineering, quality, growth and customer operations under Human CEO authority.',
  'A production-minded 10-Agent startup operating system for founders who need a complete product team without granting autonomous external authority.',
  '1.0','active','RYTHM',array['ready_company','custom_company','company_studio'],
  '{"operating_language":"English","delivery_model":"evidence_gated","human_ceo_authority":true,"external_actions_allowed":false}'::jsonb,
  '[
    {"key":"executive_operations","name":"Executive & Operations","description":"Founder support, operating cadence and cross-functional coordination."},
    {"key":"product","name":"Product","description":"Discovery, requirements and product ownership."},
    {"key":"design","name":"Design","description":"Product experience and implementation-ready design."},
    {"key":"engineering","name":"Engineering","description":"Architecture, frontend, backend and platform delivery."},
    {"key":"quality_security","name":"Quality & Security","description":"Independent QA and release assurance."},
    {"key":"growth_customer","name":"Growth & Customer","description":"Growth, sales and customer feedback loops."}
  ]'::jsonb,
  array[
    'software_chief_of_staff','software_product_manager','software_business_analyst','software_product_designer',
    'software_cto_architect','software_frontend_engineer','software_backend_engineer','software_devops_cloud_engineer',
    'software_qa_test_engineer','software_seo_geo_growth_engineer'
  ],
  array['saas_startup_delivery_v1'],
  '{"human_ceo_authority":true,"external_actions_default":false,"high_risk_requires_approval":true,"production_release_requires_approval":true,"production_migrations_require_approval":true,"protected_branch_merge_requires_approval":true,"tenant_isolation_required":true}'::jsonb,
  '{"scopes":["company","product","architecture","projects","customers","growth"],"professional_knowledge_platform_managed":true,"company_knowledge_tenant_owned":true,"cross_tenant_memory":false}'::jsonb,
  '[
    {"key":"company_mission","label":"What problem will this SaaS company solve?","type":"long_text","required":true},
    {"key":"target_customer","label":"Who is the primary customer?","type":"long_text","required":true},
    {"key":"product_stage","label":"What stage is the product at?","type":"select","required":true},
    {"key":"preferred_language","label":"Primary operating language","type":"text","required":false}
  ]'::jsonb,
  '{"agent_count":10,"agents_initial_status":"paused","external_actions_allowed":false,"credentials_copied":false,"first_step":"product_discovery"}'::jsonb,
  'saas-startup',10,array['saas','software','startup','technology'],
  array['SaaS founders','early product teams','AI-first startups'],'stable',true,
  '{"snapshot_isolation":true,"human_ceo_authority":true,"external_actions_default":false,"max_ready_company_agents":10,"upgrade_requires_review":true}'::jsonb,
  'manual_review'
)
on conflict (template_key,version) do update set
  name=excluded.name,company_type=excluded.company_type,category=excluded.category,
  description=excluded.description,positioning=excluded.positioning,status='active',
  supported_product_codes=excluded.supported_product_codes,organization_defaults=excluded.organization_defaults,
  department_templates=excluded.department_templates,agent_template_refs=excluded.agent_template_refs,
  workflow_template_refs=excluded.workflow_template_refs,governance_profile=excluded.governance_profile,
  memory_structure_template=excluded.memory_structure_template,onboarding_questions=excluded.onboarding_questions,
  launch_configuration=excluded.launch_configuration,catalog_slug=excluded.catalog_slug,
  display_order=excluded.display_order,industry_tags=excluded.industry_tags,recommended_for=excluded.recommended_for,
  maturity=excluded.maturity,is_featured=excluded.is_featured,compatibility_contract=excluded.compatibility_contract,
  upgrade_strategy=excluded.upgrade_strategy,updated_at=now();

insert into public.company_template_workflows
  (workflow_key,version,company_template_key,name,description,stages,completion_evidence)
select 'saas_startup_delivery_v1','1.0','ready_saas_startup_v1','SaaS Startup Delivery',
  'Lean evidence-gated SaaS delivery from problem validation through governed production operation.',stages,completion_evidence
from public.company_template_workflows
where workflow_key='software_product_delivery_v1' and version='1.0'
on conflict (workflow_key,version) do update set
  company_template_key=excluded.company_template_key,name=excluded.name,description=excluded.description,
  stages=excluded.stages,completion_evidence=excluded.completion_evidence,active=true,updated_at=now();

insert into public.company_template_meeting_types
  (company_template_key,meeting_key,name,purpose,default_participant_template_keys,decision_required,active)
select 'ready_saas_startup_v1',meeting_key,name,purpose,
  array(select x from unnest(default_participant_template_keys) x where x=any(array[
    'software_chief_of_staff','software_product_manager','software_business_analyst','software_product_designer',
    'software_cto_architect','software_frontend_engineer','software_backend_engineer','software_devops_cloud_engineer',
    'software_qa_test_engineer','software_seo_geo_growth_engineer'
  ])),decision_required,active
from public.company_template_meeting_types
where company_template_key='ready_software_company_v1'
on conflict (company_template_key,meeting_key) do update set
  name=excluded.name,purpose=excluded.purpose,
  default_participant_template_keys=excluded.default_participant_template_keys,
  decision_required=excluded.decision_required,active=excluded.active;

insert into public.company_template_integration_requirements
  (company_template_key,provider_key,requirement_level,purpose)
select 'ready_saas_startup_v1',provider_key,requirement_level,purpose
from public.company_template_integration_requirements
where company_template_key='ready_software_company_v1'
on conflict (company_template_key,provider_key) do update set
  requirement_level=excluded.requirement_level,purpose=excluded.purpose;

insert into public.company_template_integration_profiles
  (company_template_key,agent_template_key,provider_key,capability_key,approval_mode,scope)
select 'ready_saas_startup_v1',agent_template_key,provider_key,capability_key,approval_mode,scope
from public.company_template_integration_profiles
where company_template_key='ready_software_company_v1'
  and agent_template_key=any(array[
    'software_chief_of_staff','software_product_manager','software_business_analyst','software_product_designer',
    'software_cto_architect','software_frontend_engineer','software_backend_engineer','software_devops_cloud_engineer',
    'software_qa_test_engineer','software_seo_geo_growth_engineer'
  ])
on conflict (company_template_key,agent_template_key,provider_key,capability_key) do update set
  approval_mode=excluded.approval_mode,scope=excluded.scope;

-- Catalog metadata is read-only to customers, like the underlying templates.
revoke insert,update,delete,truncate on public.company_templates from anon,authenticated;
grant select on public.company_templates to authenticated;

commit;