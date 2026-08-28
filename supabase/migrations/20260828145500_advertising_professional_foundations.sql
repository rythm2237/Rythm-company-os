-- RYTHM OS — Phase 4 Advertising Agency professional foundation backfill
-- Ensures every Advertising Agency Agent template resolves to an active professional foundation
-- before materialize_agent_template_v1() is called during company provisioning.

begin;

update public.agent_templates
set role_family = 'marketing',
    canonical_role = 'Advertising Account Manager',
    default_specializations = array[]::text[],
    updated_at = now()
where template_key = 'advertising_account_manager' and version = '1.0';

update public.agent_templates
set role_family = 'analytics',
    canonical_role = 'Advertising Analytics Specialist',
    default_specializations = array[]::text[],
    updated_at = now()
where template_key = 'advertising_analytics_specialist' and version = '1.0';

update public.agent_templates
set role_family = 'marketing',
    canonical_role = 'Advertising Content Specialist',
    default_specializations = array[]::text[],
    updated_at = now()
where template_key = 'advertising_content_specialist' and version = '1.0';

update public.agent_templates
set role_family = 'marketing',
    canonical_role = 'Advertising Copywriter',
    default_specializations = array[]::text[],
    updated_at = now()
where template_key = 'advertising_copywriter' and version = '1.0';

update public.agent_templates
set role_family = 'design',
    canonical_role = 'Advertising Creative Director',
    default_specializations = array[]::text[],
    updated_at = now()
where template_key = 'advertising_creative_director' and version = '1.0';

update public.agent_templates
set role_family = 'marketing',
    canonical_role = 'Performance Marketing Specialist',
    default_specializations = array[]::text[],
    updated_at = now()
where template_key = 'advertising_performance_marketing' and version = '1.0';

update public.agent_templates
set role_family = 'marketing',
    canonical_role = 'Advertising Strategy Director',
    default_specializations = array[]::text[],
    updated_at = now()
where template_key = 'advertising_strategy_director' and version = '1.0';

-- Align the three Minimum Standard roles with verified role families and specializations
-- already used by the Software Company professional knowledge system.
update public.agent_templates
set role_family = 'analytics',
    canonical_role = 'Finance Operations Manager',
    default_specializations = array['finance','finops_accounting']::text[],
    updated_at = now()
where template_key = 'advertising_finance_accounting_manager' and version = '1.0';

update public.agent_templates
set role_family = 'legal',
    canonical_role = 'Legal & Compliance Advisor',
    default_specializations = array['contracts','privacy','compliance']::text[],
    updated_at = now()
where template_key = 'advertising_legal_compliance_counsel' and version = '1.0';

update public.agent_templates
set role_family = 'general',
    canonical_role = 'People & AI Workforce Operations Manager',
    default_specializations = array['people_ai_workforce_ops']::text[],
    updated_at = now()
where template_key = 'advertising_operations_people_manager' and version = '1.0';

-- Fail the migration rather than leaving a stable Ready Company with an unmaterializable Agent.
do $$
declare
  v_missing text;
begin
  select string_agg(a.template_key, ', ' order by a.template_key)
    into v_missing
  from public.company_templates c
  cross join lateral unnest(c.agent_template_refs) ref(agent_key)
  join public.agent_templates a
    on a.template_key = ref.agent_key
   and a.version = '1.0'
   and a.is_active = true
  where c.template_key = 'ready_ai_advertising_agency_v1'
    and c.status = 'active'
    and (
      a.role_family is null
      or not exists (
        select 1
        from public.role_foundations rf
        where rf.role_family = a.role_family
          and rf.status in ('active','validated')
          and (rf.canonical_role = a.canonical_role or rf.canonical_role is null)
      )
      or exists (
        select 1
        from unnest(a.default_specializations) s(specialization_key)
        where not exists (
          select 1
          from public.role_specializations rs
          where rs.role_family = a.role_family
            and rs.specialization_key = s.specialization_key
            and rs.active = true
        )
      )
    );

  if v_missing is not null then
    raise exception 'Advertising Agency professional knowledge contract is incomplete for: %', v_missing;
  end if;
end $$;

commit;
