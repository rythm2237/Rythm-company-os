-- RYTHM OS — Phase 4: Ready Company Minimum Standard v1
-- Provider-neutral baseline + Advertising Agency extension.
-- This migration declares capability contracts and governance. Provider adapters that are not
-- Production-verified remain disabled in the integration registry and cannot execute.

begin;

alter table public.company_templates
  add column if not exists minimum_standard_version text,
  add column if not exists function_coverage jsonb not null default '{}'::jsonb,
  add column if not exists integration_family_coverage text[] not null default '{}'::text[],
  add column if not exists generic_connector_fallback boolean not null default false;

-- Provider-neutral connector families. Disabled means the capability contract exists but there is
-- no Production-verified first-party executor yet. This prevents the catalog from overstating readiness.
insert into public.integration_providers
  (provider_key,display_name,category,supports_oauth,supports_token,enabled,version,allowed_environments,kill_switch)
values
  ('generic_business_api','Generic Business API','generic_connector',true,true,false,'1.0.0',array['development','preview','production'],false),
  ('accounting_erp','Accounting / ERP Connector','accounting_erp',true,true,false,'1.0.0',array['development','preview','production'],false),
  ('crm_sales','CRM / Sales Connector','crm_sales',true,true,false,'1.0.0',array['development','preview','production'],false),
  ('website_cms','Website / CMS Connector','website_cms',true,true,false,'1.0.0',array['development','preview','production'],false),
  ('analytics_bi','Analytics / BI Connector','analytics_bi',true,true,false,'1.0.0',array['development','preview','production'],false),
  ('legal_contracts','Legal / Contracts Connector','legal_contracts',true,true,false,'1.0.0',array['development','preview','production'],false),
  ('people_hris','People / HRIS Connector','people_hris',true,true,false,'1.0.0',array['development','preview','production'],false),
  ('project_work','Project / Work Management Connector','project_work',true,true,false,'1.0.0',array['development','preview','production'],false),
  ('file_storage','File / Asset Storage Connector','file_storage',true,true,false,'1.0.0',array['development','preview','production'],false),
  ('meta_marketing','Meta Marketing','advertising_social',true,true,false,'1.0.0',array['development','preview','production'],false),
  ('google_ads','Google Ads','advertising_search_display',true,true,false,'1.0.0',array['development','preview','production'],false),
  ('youtube','YouTube','social_video',true,true,false,'1.0.0',array['development','preview','production'],false),
  ('tiktok_business','TikTok for Business','advertising_social_video',true,true,false,'1.0.0',array['development','preview','production'],false),
  ('linkedin_marketing','LinkedIn Marketing','advertising_social_b2b',true,true,false,'1.0.0',array['development','preview','production'],false)
on conflict (provider_key) do update set
  display_name=excluded.display_name,category=excluded.category,supports_oauth=excluded.supports_oauth,
  supports_token=excluded.supports_token,version=excluded.version,updated_at=now();

-- Generic connector capability manifest. Disabled until hardened endpoint allowlisting, credential
-- scopes and executor validation are implemented through the Phase 2 Execution Gateway.
insert into public.integration_capabilities
  (provider_key,capability_key,risk_level,default_approval_mode,description,internal_external,read_write,
   external_side_effect,financial_impact,data_sensitivity,risk_ceiling,reversibility,adapter_version,
   rollback_supported,enabled,kill_switch)
values
  ('generic_business_api','api.read','low','autonomous','Read from an explicitly approved tenant-scoped business API endpoint.','external','read',false,false,'confidential','low','not_applicable','contract-v1',false,false,false),
  ('generic_business_api','api.write','high','approval_required','Write an exact approved payload to an allowlisted tenant-scoped business API endpoint.','external','write',true,false,'confidential','high','compensatable','contract-v1',false,false,false),
  ('generic_business_api','webhook.send','high','approval_required','Send an exact approved webhook payload to an allowlisted endpoint.','external','write',true,false,'confidential','high','irreversible','contract-v1',false,false,false),
  ('generic_business_api','file.exchange','high','approval_required','Exchange an exact approved file through a configured tenant connector.','external','write',true,false,'confidential','high','irreversible','contract-v1',false,false,false)
on conflict (provider_key,capability_key) do update set
  risk_level=excluded.risk_level,default_approval_mode=excluded.default_approval_mode,
  description=excluded.description,read_write=excluded.read_write,external_side_effect=excluded.external_side_effect,
  financial_impact=excluded.financial_impact,data_sensitivity=excluded.data_sensitivity,risk_ceiling=excluded.risk_ceiling,
  reversibility=excluded.reversibility,adapter_version=excluded.adapter_version,enabled=excluded.enabled;

-- Reusable baseline family contracts.
with families(provider_key) as (
  values ('accounting_erp'),('crm_sales'),('website_cms'),('analytics_bi'),('legal_contracts'),('people_hris'),('project_work'),('file_storage')
)
insert into public.integration_capabilities
  (provider_key,capability_key,risk_level,default_approval_mode,description,internal_external,read_write,
   external_side_effect,financial_impact,data_sensitivity,risk_ceiling,reversibility,adapter_version,
   rollback_supported,enabled,kill_switch)
select provider_key,'records.read','low','autonomous','Read authorized tenant business records.','external','read',false,false,'confidential','low','not_applicable','contract-v1',false,false,false from families
on conflict (provider_key,capability_key) do nothing;

with families(provider_key) as (
  values ('accounting_erp'),('crm_sales'),('website_cms'),('analytics_bi'),('legal_contracts'),('people_hris'),('project_work'),('file_storage')
)
insert into public.integration_capabilities
  (provider_key,capability_key,risk_level,default_approval_mode,description,internal_external,read_write,
   external_side_effect,financial_impact,data_sensitivity,risk_ceiling,reversibility,adapter_version,
   rollback_supported,enabled,kill_switch)
select provider_key,'records.write','high','approval_required','Write an exact Human CEO approved business record change.','external','write',true,false,'confidential','high','compensatable','contract-v1',false,false,false from families
on conflict (provider_key,capability_key) do nothing;

-- Advertising execution contracts. Budget/spend changes are always explicit Human CEO actions.
insert into public.integration_capabilities
  (provider_key,capability_key,risk_level,default_approval_mode,description,internal_external,read_write,
   external_side_effect,financial_impact,data_sensitivity,risk_ceiling,reversibility,adapter_version,
   rollback_supported,enabled,kill_switch)
values
  ('meta_marketing','campaign.read','low','autonomous','Read authorized Meta campaign/account state and performance.','external','read',false,false,'confidential','low','not_applicable','contract-v1',false,false,false),
  ('meta_marketing','campaign.create','high','approval_required','Create an exact approved Meta campaign/ad set/ad draft or activation change.','external','write',true,false,'confidential','high','compensatable','contract-v1',true,false,false),
  ('meta_marketing','content.publish','high','approval_required','Publish an exact approved Facebook/Instagram post, story, reel or supported professional content.','external','write',true,false,'confidential','high','compensatable','contract-v1',true,false,false),
  ('meta_marketing','budget.modify','restricted','human_only','Modify advertising budget, bid or spend authorization.','external','write',true,true,'restricted','restricted','compensatable','contract-v1',true,false,false),

  ('google_ads','campaign.read','low','autonomous','Read authorized Google Ads campaign state and performance.','external','read',false,false,'confidential','low','not_applicable','contract-v1',false,false,false),
  ('google_ads','campaign.create','high','approval_required','Create or materially modify an exact approved Google Ads campaign.','external','write',true,false,'confidential','high','compensatable','contract-v1',true,false,false),
  ('google_ads','budget.modify','restricted','human_only','Modify Google Ads budget or spend authorization.','external','write',true,true,'restricted','restricted','compensatable','contract-v1',true,false,false),

  ('youtube','channel.read','low','autonomous','Read authorized YouTube channel/video metadata and performance inputs.','external','read',false,false,'confidential','low','not_applicable','contract-v1',false,false,false),
  ('youtube','video.upload','high','approval_required','Upload an exact approved video and metadata to the authorized YouTube channel.','external','write',true,false,'confidential','high','compensatable','contract-v1',true,false,false),
  ('youtube','video.publish','high','approval_required','Publish or change visibility of an exact approved YouTube video.','external','write',true,false,'confidential','high','compensatable','contract-v1',true,false,false),

  ('tiktok_business','campaign.read','low','autonomous','Read authorized TikTok campaign/account state and performance.','external','read',false,false,'confidential','low','not_applicable','contract-v1',false,false,false),
  ('tiktok_business','campaign.create','high','approval_required','Create or materially modify an exact approved TikTok advertising campaign.','external','write',true,false,'confidential','high','compensatable','contract-v1',true,false,false),
  ('tiktok_business','content.upload','medium','approval_required','Upload an approved TikTok photo/video draft for review.','external','write',true,false,'confidential','medium','compensatable','contract-v1',true,false,false),
  ('tiktok_business','content.publish','high','approval_required','Direct-publish exact approved TikTok content where account/API permissions allow.','external','write',true,false,'confidential','high','compensatable','contract-v1',true,false,false),
  ('tiktok_business','budget.modify','restricted','human_only','Modify TikTok advertising budget or spend authorization.','external','write',true,true,'restricted','restricted','compensatable','contract-v1',true,false,false),

  ('linkedin_marketing','campaign.read','low','autonomous','Read authorized LinkedIn campaign/account state and performance.','external','read',false,false,'confidential','low','not_applicable','contract-v1',false,false,false),
  ('linkedin_marketing','campaign.create','high','approval_required','Create or materially modify an exact approved LinkedIn campaign.','external','write',true,false,'confidential','high','compensatable','contract-v1',true,false,false),
  ('linkedin_marketing','content.publish','high','approval_required','Publish exact approved company Page content where API permissions allow.','external','write',true,false,'confidential','high','compensatable','contract-v1',true,false,false),
  ('linkedin_marketing','budget.modify','restricted','human_only','Modify LinkedIn advertising budget or spend authorization.','external','write',true,true,'restricted','restricted','compensatable','contract-v1',true,false,false)
on conflict (provider_key,capability_key) do update set
  risk_level=excluded.risk_level,default_approval_mode=excluded.default_approval_mode,description=excluded.description,
  read_write=excluded.read_write,external_side_effect=excluded.external_side_effect,financial_impact=excluded.financial_impact,
  data_sensitivity=excluded.data_sensitivity,risk_ceiling=excluded.risk_ceiling,reversibility=excluded.reversibility,
  adapter_version=excluded.adapter_version,rollback_supported=excluded.rollback_supported,enabled=excluded.enabled;

-- Advertising Agency business-control Agents. These bring the Ready Company to 10 Agents while
-- keeping industry delivery roles intact.
insert into public.agent_templates (
  template_key,version,name,role,role_code,department_template_key,reports_to_template_key,purpose,
  responsibilities,skills,work_style,kpis,success_criteria,default_authority_level,default_risk_ceiling,
  default_human_approval_requirements,default_allowed_tools,default_memory_scope,default_language,
  system_instructions_template,runtime_policy_key,budget_policy_key,is_active,canonical_role,role_family,
  default_specializations,default_model_policy,default_language_policy,monthly_company_cost,cost_currency,cost_model,sale_price_monthly
)
select
  'advertising_finance_accounting_manager','1.0','Finance & Accounting Manager','Finance & Accounting Manager','ADV-FIN-001',
  'finance_legal','advertising_strategy_director',
  'Own agency finance analysis, bookkeeping coordination, invoicing controls and management reporting without autonomous spending or payout authority.',
  responsibilities,skills,work_style,kpis,success_criteria,1,'high',
  '["payments","refunds","payouts","budget changes","tax filings"]'::jsonb,default_allowed_tools,
  default_memory_scope,default_language,
  'Operate as the agency Finance & Accounting Manager. Maintain accurate internal finance analysis and coordinate accounting evidence. Never authorize spending, payouts, tax filings or binding financial actions without explicit Human CEO approval.',
  runtime_policy_key,budget_policy_key,true,'finance_accounting_manager','finance_legal',array['accounting','invoicing','finance operations'],
  default_model_policy,default_language_policy,monthly_company_cost,cost_currency,cost_model,sale_price_monthly
from public.agent_templates where template_key='software_finance_manager' and version='1.0'
on conflict (template_key,version) do update set purpose=excluded.purpose,department_template_key=excluded.department_template_key,
  reports_to_template_key=excluded.reports_to_template_key,system_instructions_template=excluded.system_instructions_template,
  default_human_approval_requirements=excluded.default_human_approval_requirements,updated_at=now();

insert into public.agent_templates (
  template_key,version,name,role,role_code,department_template_key,reports_to_template_key,purpose,
  responsibilities,skills,work_style,kpis,success_criteria,default_authority_level,default_risk_ceiling,
  default_human_approval_requirements,default_allowed_tools,default_memory_scope,default_language,
  system_instructions_template,runtime_policy_key,budget_policy_key,is_active,canonical_role,role_family,
  default_specializations,default_model_policy,default_language_policy,monthly_company_cost,cost_currency,cost_model,sale_price_monthly
)
select
  'advertising_legal_compliance_counsel','1.0','Legal & Compliance Counsel','Legal & Compliance Counsel','ADV-LEG-001',
  'finance_legal','advertising_strategy_director',
  'Provide legal issue spotting, advertising/privacy/commercial compliance review and contract coordination under Human CEO authority.',
  responsibilities,skills,work_style,kpis,success_criteria,1,'high',
  '["contract signature","regulatory filing","legal representation","binding legal commitment"]'::jsonb,default_allowed_tools,
  default_memory_scope,default_language,
  'Operate as the agency Legal & Compliance Counsel. Review advertising, privacy, contract and commercial risks. You may recommend and draft internally, but contract signature, regulatory filings, legal representation and binding commitments are human-only.',
  runtime_policy_key,budget_policy_key,true,'legal_compliance_counsel','finance_legal',array['advertising compliance','privacy','contracts'],
  default_model_policy,default_language_policy,monthly_company_cost,cost_currency,cost_model,sale_price_monthly
from public.agent_templates where template_key='software_legal_compliance_counsel' and version='1.0'
on conflict (template_key,version) do update set purpose=excluded.purpose,department_template_key=excluded.department_template_key,
  reports_to_template_key=excluded.reports_to_template_key,system_instructions_template=excluded.system_instructions_template,
  default_human_approval_requirements=excluded.default_human_approval_requirements,updated_at=now();

insert into public.agent_templates (
  template_key,version,name,role,role_code,department_template_key,reports_to_template_key,purpose,
  responsibilities,skills,work_style,kpis,success_criteria,default_authority_level,default_risk_ceiling,
  default_human_approval_requirements,default_allowed_tools,default_memory_scope,default_language,
  system_instructions_template,runtime_policy_key,budget_policy_key,is_active,canonical_role,role_family,
  default_specializations,default_model_policy,default_language_policy,monthly_company_cost,cost_currency,cost_model,sale_price_monthly
)
select
  'advertising_operations_people_manager','1.0','Operations & People Manager','Operations & People Manager','ADV-OPS-001',
  'operations_people','advertising_strategy_director',
  'Own operating cadence, workload coordination, workforce administration and internal process reliability for the agency.',
  responsibilities,skills,work_style,kpis,success_criteria,1,'medium',
  '["employment termination","compensation commitment","binding HR action"]'::jsonb,default_allowed_tools,
  default_memory_scope,default_language,
  'Operate as the agency Operations & People Manager. Coordinate workload, process, capacity and workforce administration. Binding employment, compensation and termination actions remain Human CEO controlled.',
  runtime_policy_key,budget_policy_key,true,'operations_people_manager','operations_people',array['operations','workforce coordination','capacity'],
  default_model_policy,default_language_policy,monthly_company_cost,cost_currency,cost_model,sale_price_monthly
from public.agent_templates where template_key='software_people_workforce_manager' and version='1.0'
on conflict (template_key,version) do update set purpose=excluded.purpose,department_template_key=excluded.department_template_key,
  reports_to_template_key=excluded.reports_to_template_key,system_instructions_template=excluded.system_instructions_template,
  default_human_approval_requirements=excluded.default_human_approval_requirements,updated_at=now();

update public.company_templates
set department_templates='[
  {"key":"strategy","name":"Strategy","description":"Advertising strategy, positioning and executive coordination"},
  {"key":"accounts","name":"Accounts","description":"Client intake, CRM, brief and requirement coordination"},
  {"key":"creative","name":"Creative","description":"Creative direction, copy and channel-specific content"},
  {"key":"performance","name":"Performance Marketing","description":"Campaign, channel and optimization planning"},
  {"key":"analytics","name":"Analytics","description":"Measurement, attribution and performance interpretation"},
  {"key":"finance_legal","name":"Finance & Legal","description":"Accounting, invoicing, commercial controls, legal and compliance"},
  {"key":"operations_people","name":"Operations & People","description":"Operating cadence, capacity and workforce administration"}
]'::jsonb,
agent_template_refs=array[
  'advertising_strategy_director','advertising_account_manager','advertising_creative_director','advertising_copywriter',
  'advertising_content_specialist','advertising_performance_marketing','advertising_analytics_specialist',
  'advertising_finance_accounting_manager','advertising_legal_compliance_counsel','advertising_operations_people_manager'
],
launch_configuration=jsonb_set(jsonb_set(launch_configuration,'{agent_count}','10'::jsonb,true),'{external_actions_allowed}','false'::jsonb,true),
minimum_standard_version='1.0',
function_coverage='{"executive_operations":"advertising_strategy_director","finance_accounting":"advertising_finance_accounting_manager","legal_compliance":"advertising_legal_compliance_counsel","people_workforce":"advertising_operations_people_manager","sales_crm_client":"advertising_account_manager","communications_support":"advertising_account_manager","industry_delivery":["advertising_creative_director","advertising_copywriter","advertising_content_specialist","advertising_performance_marketing"],"analytics_reporting":"advertising_analytics_specialist","security_permissions_audit":"platform_governance","human_ceo_authority":true}'::jsonb,
integration_family_coverage=array['productivity','accounting_erp','payments_banking','crm_sales','website_cms','analytics_bi','legal_contracts','people_hris','project_work','file_storage','generic_business_api','meta_marketing','google_ads','youtube','tiktok_business','linkedin_marketing'],
generic_connector_fallback=true,
compatibility_contract=compatibility_contract || '{"ready_company_minimum_standard":"1.0","advertising_extension":"1.0","spend_requires_human_ceo":true,"provider_adapters_must_be_verified_before_execution":true}'::jsonb,
updated_at=now()
where template_key='ready_ai_advertising_agency_v1' and version='1.0';

-- Baseline declarations for Advertising Agency.
insert into public.company_template_integration_requirements
  (company_template_key,provider_key,requirement_level,purpose)
values
  ('ready_ai_advertising_agency_v1','google_workspace','optional','Email, calendar, documents and governed client communication.'),
  ('ready_ai_advertising_agency_v1','microsoft_365','optional','Email, calendar, documents and governed client communication.'),
  ('ready_ai_advertising_agency_v1','accounting_erp','recommended','Accounting, bookkeeping, invoicing and ERP connection independent of country/vendor.'),
  ('ready_ai_advertising_agency_v1','crm_sales','recommended','Client CRM, pipeline, account and opportunity records.'),
  ('ready_ai_advertising_agency_v1','website_cms','optional','Agency/client website and CMS management through a governed connector.'),
  ('ready_ai_advertising_agency_v1','analytics_bi','recommended','Campaign, web and business analytics/BI.'),
  ('ready_ai_advertising_agency_v1','legal_contracts','recommended','Contracts, e-signature and legal document systems.'),
  ('ready_ai_advertising_agency_v1','people_hris','optional','Workforce/HRIS records and operating administration.'),
  ('ready_ai_advertising_agency_v1','project_work','recommended','Campaign/project/task coordination.'),
  ('ready_ai_advertising_agency_v1','file_storage','recommended','Creative assets, briefs and governed company/client files.'),
  ('ready_ai_advertising_agency_v1','generic_business_api','recommended','Fallback for local/country-specific or unsupported business systems via governed API/webhook/file connectors.'),
  ('ready_ai_advertising_agency_v1','meta_marketing','recommended','Meta Ads plus Facebook/Instagram professional publishing where API permissions allow.'),
  ('ready_ai_advertising_agency_v1','google_ads','recommended','Google Search, Display, Video and supported campaign operations.'),
  ('ready_ai_advertising_agency_v1','youtube','recommended','YouTube channel/video publishing and campaign creative workflow.'),
  ('ready_ai_advertising_agency_v1','tiktok_business','recommended','TikTok Ads Manager plus approved organic content posting.'),
  ('ready_ai_advertising_agency_v1','linkedin_marketing','optional','LinkedIn campaign management and company Page publishing where API permissions allow.')
on conflict (company_template_key,provider_key) do update set
  requirement_level=excluded.requirement_level,purpose=excluded.purpose;

-- Agent-to-capability contracts for Advertising Agency. The provider/capability can be declared before
-- the executor is enabled; execution remains fail-closed until the provider registry is enabled.
insert into public.company_template_integration_profiles
  (company_template_key,agent_template_key,provider_key,capability_key,approval_mode,scope)
values
  ('ready_ai_advertising_agency_v1','advertising_performance_marketing','meta_marketing','campaign.read','autonomous','{"tenant_only":true}'::jsonb),
  ('ready_ai_advertising_agency_v1','advertising_performance_marketing','meta_marketing','campaign.create','approval_required','{"tenant_only":true,"exact_campaign":true}'::jsonb),
  ('ready_ai_advertising_agency_v1','advertising_content_specialist','meta_marketing','content.publish','approval_required','{"tenant_only":true,"exact_content":true}'::jsonb),
  ('ready_ai_advertising_agency_v1','advertising_performance_marketing','meta_marketing','budget.modify','human_only','{"tenant_only":true,"spend":true}'::jsonb),

  ('ready_ai_advertising_agency_v1','advertising_performance_marketing','google_ads','campaign.read','autonomous','{"tenant_only":true}'::jsonb),
  ('ready_ai_advertising_agency_v1','advertising_performance_marketing','google_ads','campaign.create','approval_required','{"tenant_only":true,"exact_campaign":true}'::jsonb),
  ('ready_ai_advertising_agency_v1','advertising_performance_marketing','google_ads','budget.modify','human_only','{"tenant_only":true,"spend":true}'::jsonb),

  ('ready_ai_advertising_agency_v1','advertising_content_specialist','youtube','channel.read','autonomous','{"tenant_only":true}'::jsonb),
  ('ready_ai_advertising_agency_v1','advertising_content_specialist','youtube','video.upload','approval_required','{"tenant_only":true,"exact_content":true}'::jsonb),
  ('ready_ai_advertising_agency_v1','advertising_content_specialist','youtube','video.publish','approval_required','{"tenant_only":true,"exact_content":true}'::jsonb),

  ('ready_ai_advertising_agency_v1','advertising_performance_marketing','tiktok_business','campaign.read','autonomous','{"tenant_only":true}'::jsonb),
  ('ready_ai_advertising_agency_v1','advertising_performance_marketing','tiktok_business','campaign.create','approval_required','{"tenant_only":true,"exact_campaign":true}'::jsonb),
  ('ready_ai_advertising_agency_v1','advertising_content_specialist','tiktok_business','content.upload','approval_required','{"tenant_only":true,"exact_content":true}'::jsonb),
  ('ready_ai_advertising_agency_v1','advertising_content_specialist','tiktok_business','content.publish','approval_required','{"tenant_only":true,"exact_content":true}'::jsonb),
  ('ready_ai_advertising_agency_v1','advertising_performance_marketing','tiktok_business','budget.modify','human_only','{"tenant_only":true,"spend":true}'::jsonb),

  ('ready_ai_advertising_agency_v1','advertising_performance_marketing','linkedin_marketing','campaign.read','autonomous','{"tenant_only":true}'::jsonb),
  ('ready_ai_advertising_agency_v1','advertising_performance_marketing','linkedin_marketing','campaign.create','approval_required','{"tenant_only":true,"exact_campaign":true}'::jsonb),
  ('ready_ai_advertising_agency_v1','advertising_content_specialist','linkedin_marketing','content.publish','approval_required','{"tenant_only":true,"exact_content":true}'::jsonb),
  ('ready_ai_advertising_agency_v1','advertising_performance_marketing','linkedin_marketing','budget.modify','human_only','{"tenant_only":true,"spend":true}'::jsonb),

  ('ready_ai_advertising_agency_v1','advertising_finance_accounting_manager','accounting_erp','records.read','autonomous','{"tenant_only":true}'::jsonb),
  ('ready_ai_advertising_agency_v1','advertising_finance_accounting_manager','accounting_erp','records.write','approval_required','{"tenant_only":true,"exact_change":true}'::jsonb),
  ('ready_ai_advertising_agency_v1','advertising_legal_compliance_counsel','legal_contracts','records.read','autonomous','{"tenant_only":true}'::jsonb),
  ('ready_ai_advertising_agency_v1','advertising_legal_compliance_counsel','legal_contracts','records.write','approval_required','{"tenant_only":true,"signature_forbidden":true}'::jsonb),
  ('ready_ai_advertising_agency_v1','advertising_operations_people_manager','people_hris','records.read','autonomous','{"tenant_only":true}'::jsonb),
  ('ready_ai_advertising_agency_v1','advertising_operations_people_manager','people_hris','records.write','approval_required','{"tenant_only":true,"binding_hr_actions_forbidden":true}'::jsonb),
  ('ready_ai_advertising_agency_v1','advertising_account_manager','crm_sales','records.read','autonomous','{"tenant_only":true}'::jsonb),
  ('ready_ai_advertising_agency_v1','advertising_account_manager','crm_sales','records.write','approval_required','{"tenant_only":true}'::jsonb)
on conflict (company_template_key,agent_template_key,provider_key,capability_key) do update set
  approval_mode=excluded.approval_mode,scope=excluded.scope;

-- Software Company is functionally complete but its provider-neutral family declarations were partial.
update public.company_templates set
  minimum_standard_version='1.0',
  function_coverage='{"executive_operations":"software_chief_of_staff","finance_accounting":"software_finance_manager","legal_compliance":"software_legal_compliance_counsel","people_workforce":"software_people_workforce_manager","sales_crm_client":"software_sales_crm_manager","communications_support":"software_communications_support_manager","industry_delivery":"software_product_delivery_team","analytics_reporting":"software_business_analyst","security_permissions_audit":"software_application_security_engineer","human_ceo_authority":true}'::jsonb,
  integration_family_coverage=array['productivity','accounting_erp','payments_banking','crm_sales','website_cms','analytics_bi','legal_contracts','people_hris','project_work','file_storage','generic_business_api','source_control','deployment','database'],
  generic_connector_fallback=true,
  compatibility_contract=compatibility_contract || '{"ready_company_minimum_standard":"1.0","provider_adapters_must_be_verified_before_execution":true}'::jsonb,
  updated_at=now()
where template_key='ready_software_company_v1' and version='1.0';

insert into public.company_template_integration_requirements
  (company_template_key,provider_key,requirement_level,purpose)
values
  ('ready_software_company_v1','accounting_erp','recommended','Accounting, bookkeeping, invoicing and ERP connection independent of country/vendor.'),
  ('ready_software_company_v1','crm_sales','recommended','CRM, pipeline and customer records.'),
  ('ready_software_company_v1','website_cms','optional','Company website and CMS connection.'),
  ('ready_software_company_v1','analytics_bi','recommended','Product, web and business analytics/BI.'),
  ('ready_software_company_v1','legal_contracts','recommended','Contracts, e-signature and legal document systems.'),
  ('ready_software_company_v1','people_hris','optional','Workforce/HRIS records.'),
  ('ready_software_company_v1','project_work','recommended','Project/task/work management.'),
  ('ready_software_company_v1','file_storage','recommended','Governed company files and documentation.'),
  ('ready_software_company_v1','generic_business_api','recommended','Fallback for local/country-specific or unsupported business systems.')
on conflict (company_template_key,provider_key) do update set requirement_level=excluded.requirement_level,purpose=excluded.purpose;

-- SaaS Startup does not yet satisfy the mandatory Finance/Legal/People baseline within the 10-Agent
-- Ready Company cap. Keep it visible but do not claim stable compliance until a roster redesign is shipped.
update public.company_templates set
  maturity='preview',
  minimum_standard_version=null,
  generic_connector_fallback=false,
  compatibility_contract=compatibility_contract || '{"ready_company_minimum_standard_status":"upgrade_required","missing_functions":["finance_accounting","legal_compliance","people_workforce"]}'::jsonb,
  updated_at=now()
where template_key='ready_saas_startup_v1' and version='1.0';

commit;
