begin;

-- Complete the advertising management chain for future installations. Existing
-- tenant snapshots and reporting lines remain immutable until reviewed upgrade.
update public.agent_templates
set reports_to_template_key='advertising_strategy_director', updated_at=now()
where version='1.0' and template_key in (
  'advertising_account_manager','advertising_creative_director',
  'advertising_performance_marketing','advertising_analytics_specialist'
);

insert into public.company_template_workflows
  (workflow_key,version,company_template_key,name,description,stages,completion_evidence)
values (
  'advertising_brief_to_approval_v1','1.0','ready_ai_advertising_agency_v1',
  'Advertising Brief to Measured Delivery',
  'Evidence-gated campaign work from client brief through Human CEO approval, governed activation and measured reporting. External actions require a verified connection and exact-scope approval.',
  '[
    {"key":"INTAKE","name":"Client intake","owner":"advertising_account_manager"},
    {"key":"CLARIFY","name":"Clarify requirements","owner":"advertising_account_manager"},
    {"key":"STRATEGY","name":"Strategy and GTM","owner":"advertising_strategy_director"},
    {"key":"CREATIVE","name":"Creative direction and drafts","owner":"advertising_creative_director"},
    {"key":"CHANNEL_PLAN","name":"Channel and campaign plan","owner":"advertising_performance_marketing"},
    {"key":"MEASUREMENT_PLAN","name":"Measurement plan","owner":"advertising_analytics_specialist"},
    {"key":"COMPLIANCE_REVIEW","name":"Claims and compliance review","owner":"advertising_legal_compliance_counsel"},
    {"key":"CLIENT_REVIEW","name":"Client review","owner":"advertising_account_manager","approval_required":true},
    {"key":"HUMAN_APPROVAL","name":"Human CEO approval","owner":"advertising_strategy_director","approval_required":true},
    {"key":"ACTIVATE","name":"Governed activation","owner":"advertising_performance_marketing","approval_required":true},
    {"key":"MONITOR","name":"Performance monitoring","owner":"advertising_analytics_specialist"},
    {"key":"REPORT","name":"Client reporting","owner":"advertising_account_manager","approval_required":true},
    {"key":"ITERATE","name":"Optimization decision","owner":"advertising_strategy_director"}
  ]'::jsonb,
  '{
    "INTAKE":["client brief","owner and scope"],
    "CLARIFY":["resolved questions","recorded assumptions"],
    "STRATEGY":["goals","audience","positioning","GTM recommendation"],
    "CREATIVE":["reviewed copy and assets","claim sources"],
    "CHANNEL_PLAN":["channel selection","budget proposal","targeting and constraints"],
    "MEASUREMENT_PLAN":["baseline","KPI definitions","attribution caveats"],
    "COMPLIANCE_REVIEW":["claims review","privacy and platform policy risks"],
    "CLIENT_REVIEW":["client decision or documented internal-only scope"],
    "HUMAN_APPROVAL":["Human CEO approval of exact content, spend and action scope"],
    "ACTIVATE":["verified provider connection or documented native alternative","approved external action result"],
    "MONITOR":["observed performance","exceptions and incidents"],
    "REPORT":["measured results","human-approved external report"],
    "ITERATE":["decision","owner","next review date"]
  }'::jsonb
)
on conflict (workflow_key,version) do update set
  company_template_key=excluded.company_template_key,name=excluded.name,
  description=excluded.description,stages=excluded.stages,
  completion_evidence=excluded.completion_evidence,active=true,updated_at=now();

insert into public.company_template_meeting_types
  (company_template_key,meeting_key,name,purpose,default_participant_template_keys,decision_required)
values
  ('ready_ai_advertising_agency_v1','client_discovery','Client Discovery','Resolve brief gaps, scope and accountable next steps.',array['advertising_account_manager','advertising_strategy_director','gtm-strategist'],true),
  ('ready_ai_advertising_agency_v1','strategy_review','Strategy Review','Review market evidence, positioning, channel choices and budget proposal.',array['advertising_strategy_director','gtm-strategist','advertising_performance_marketing','advertising_analytics_specialist'],true),
  ('ready_ai_advertising_agency_v1','creative_review','Creative Review','Review copy, content, brand fit and evidence for public claims.',array['advertising_creative_director','advertising_copywriter','advertising_content_specialist','advertising_account_manager'],true),
  ('ready_ai_advertising_agency_v1','campaign_readiness','Campaign Readiness','Review targeting, spend, measurement, compliance and exact external actions before approval.',array['advertising_strategy_director','advertising_performance_marketing','advertising_analytics_specialist','advertising_legal_compliance_counsel','advertising_finance_accounting_manager'],true),
  ('ready_ai_advertising_agency_v1','performance_review','Performance Review','Assess measured outcomes, deviations and optimization options.',array['advertising_analytics_specialist','advertising_performance_marketing','advertising_strategy_director','advertising_account_manager'],true),
  ('ready_ai_advertising_agency_v1','client_report_review','Client Report Review','Approve evidence-backed client reporting and material commitments.',array['advertising_account_manager','advertising_analytics_specialist','advertising_strategy_director'],true),
  ('ready_ai_advertising_agency_v1','operating_review','Agency Operating Review','Review workload, financial controls, risks and stalled decisions.',array['advertising_strategy_director','advertising_operations_people_manager','advertising_finance_accounting_manager','advertising_legal_compliance_counsel'],true)
on conflict (company_template_key,meeting_key) do update set
  name=excluded.name,purpose=excluded.purpose,
  default_participant_template_keys=excluded.default_participant_template_keys,
  decision_required=excluded.decision_required,active=true;

-- A previous installation retains its captured snapshot; surface the new
-- operational catalog as an available, reviewed upgrade.
update public.organization_template_installations
set upgrade_status='upgrade_available'
where template_key='ready_ai_advertising_agency_v1' and template_version='1.0'
  and template_snapshot is not null and upgrade_status='current';

-- The ten-agent SaaS roster still lacks Finance, Legal and People coverage,
-- and two referenced workflow owners. It stays explicitly preview.
update public.company_templates
set maturity='preview',
  compatibility_contract=compatibility_contract ||
    '{"ready_company_minimum_standard_status":"upgrade_required","missing_functions":["finance_accounting","legal_compliance","people_workforce"],"unresolved_workflow_owners":2}'::jsonb,
  updated_at=now()
where template_key='ready_saas_startup_v1' and version='1.0';

-- The two-agent Web Development overlay cannot resolve its borrowed 19-agent
-- workflow and has no meeting/integration profile. Withdraw it from new sales.
update public.company_templates
set status='inactive',maturity='preview',
  compatibility_contract=compatibility_contract ||
    '{"ready_company_minimum_standard_status":"upgrade_required","publication_status":"withdrawn_pending_operational_completion","unresolved_workflow_owners":12,"missing_meetings":true,"missing_integration_profiles":true}'::jsonb,
  updated_at=now()
where template_key='ready_web_development_company_v1' and version='1.0';

do $$
declare v_template public.company_templates%rowtype;
begin
  select * into v_template from public.company_templates
  where template_key='ready_ai_advertising_agency_v1' and version='1.0';
  if v_template.id is null or v_template.status<>'active' or v_template.maturity<>'stable'
     or (select count(*) from public.agent_templates a
       where a.template_key=any(v_template.agent_template_refs) and a.version=v_template.version
         and a.reports_to_template_key is null)<>1
     or exists(select 1 from unnest(v_template.agent_template_refs) r
       left join public.agent_templates a on a.template_key=r and a.version=v_template.version and a.is_active
       where a.id is null or (a.reports_to_template_key is not null
         and not(a.reports_to_template_key=any(v_template.agent_template_refs))))
     or exists(select 1 from unnest(v_template.workflow_template_refs) r
       left join public.company_template_workflows w on w.workflow_key=r and w.version=v_template.version and w.active
       where w.workflow_key is null)
     or exists(select 1 from public.company_template_workflows w
       cross join lateral jsonb_array_elements(w.stages) s
       where w.workflow_key=any(v_template.workflow_template_refs) and w.version=v_template.version
         and not(s->>'owner'=any(v_template.agent_template_refs)))
     or not exists(select 1 from public.company_template_meeting_types m
       where m.company_template_key=v_template.template_key and m.active)
     or not exists(select 1 from public.company_template_integration_profiles p
       where p.company_template_key=v_template.template_key)
     or not exists(select 1 from public.company_template_integration_requirements r
       where r.company_template_key=v_template.template_key)
     or exists(select 1 from public.company_template_meeting_types m
       cross join lateral unnest(m.default_participant_template_keys) a
       where m.company_template_key=v_template.template_key and m.active
         and not(a=any(v_template.agent_template_refs)))
  then raise exception 'Advertising Agency operational template is unresolved'; end if;
end $$;

commit;
