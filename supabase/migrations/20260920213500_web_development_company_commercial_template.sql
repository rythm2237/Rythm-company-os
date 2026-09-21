-- Reference commercial overlay for a focused Web Development Company.
-- Reuses existing governed software agent templates; no duplicate agent runtime/system is introduced.
insert into public.company_templates(
  template_key,name,company_type,category,description,positioning,version,status,owner_name,
  supported_product_codes,organization_defaults,department_templates,agent_template_refs,workflow_template_refs,
  governance_profile,memory_structure_template,onboarding_questions,launch_configuration,catalog_slug,display_order,
  industry_tags,recommended_for,maturity,is_featured,compatibility_contract,upgrade_strategy,minimum_standard_version,
  function_coverage,integration_family_coverage,generic_connector_fallback
) values (
  'ready_web_development_company_v1','Web Development Company','web_development_company','Ready Companies',
  'A focused governed AI web-development company with a Project Manager and Web Developer at launch, plus specialist agents that can be hired independently.',
  'Deliver websites and web applications through a small active AI team with explicit permissions, approval-gated production actions and separately metered AI usage.',
  '1.0','active','RYTHM',array['company_studio'],
  '{"delivery_model":"evidence_gated","operating_language":"English","human_ceo_authority":true,"external_actions_allowed":false}'::jsonb,
  '[{"key":"delivery","name":"Delivery","description":"Project management and customer delivery."},{"key":"engineering","name":"Engineering","description":"Web implementation and platform delivery."},{"key":"specialists","name":"Specialists","description":"Hireable design, QA, SEO, DevOps and content expertise."}]'::jsonb,
  array['software_product_manager','software_frontend_engineer'],array['software_product_delivery_v1'],
  '{"restricted_actions":"human_only","human_ceo_authority":true,"external_actions_default":false,"tenant_isolation_required":true,"high_risk_requires_approval":true,"production_release_requires_approval":true,"production_migrations_require_approval":true,"protected_branch_merge_requires_approval":true,"billing_changes_require_approval":true,"domain_changes_require_approval":true,"secret_rotation_requires_approval":true}'::jsonb,
  '{"scopes":["company","projects","customers","operations"],"cross_tenant_memory":false,"company_knowledge_tenant_owned":true}'::jsonb,
  '[{"key":"company_mission","type":"long_text","label":"What kind of web projects should this company deliver?","required":true},{"key":"target_customer","type":"long_text","label":"Who is the target customer?","required":true},{"key":"technology_constraints","type":"long_text","label":"Preferred stack, hosting, security or delivery constraints"}]'::jsonb,
  '{"agent_count":2,"agents_initial_status":"paused","external_actions_allowed":false,"integration_credentials_copied":false,"commercial_model":{"agent_subscription_separate_from_ai_usage":true,"usage_payer":"company_wallet"},"active_team":[{"template_key":"software_product_manager","display_name":"Project Manager","commercial_status":"included"},{"template_key":"software_frontend_engineer","display_name":"Web Developer","commercial_status":"included"}],"available_agents":[{"template_key":"software_product_designer","display_name":"UI/UX Designer","price_monthly":19,"currency":"EUR","cta":"Hire Agent"},{"template_key":"software_qa_test_engineer","display_name":"QA Engineer","price_monthly":15,"currency":"EUR","cta":"Hire Agent"},{"template_key":"software_seo_geo_growth_engineer","display_name":"SEO Specialist","price_monthly":29,"currency":"EUR","cta":"Hire Agent"},{"template_key":"software_devops_cloud_engineer","display_name":"DevOps Engineer","price_monthly":25,"currency":"EUR","cta":"Hire Agent"},{"template_key":"software_technical_writer","display_name":"Content Specialist","price_monthly":15,"currency":"EUR","cta":"Hire Agent"}],"trial_policy":{"supported":true,"explicit_conversion_required":true,"auto_charge_after_trial":false}}'::jsonb,
  'web-development-company',31,array['web development','agency','software','digital services'],array['web studios','freelance teams','small agencies','technical founders'],'stable',false,
  '{"snapshot_isolation":true,"human_ceo_authority":true,"upgrade_requires_review":true,"external_actions_default":false,"provider_adapters_must_be_verified_before_execution":true}'::jsonb,
  'manual_review','1.0','{"project_delivery":"software_product_manager","web_implementation":"software_frontend_engineer","human_ceo_authority":true}'::jsonb,
  array['source_control','deployment','database','project_work','file_storage','analytics_bi'],true
)
on conflict(template_key,version) do update set
  name=excluded.name,description=excluded.description,positioning=excluded.positioning,status=excluded.status,
  organization_defaults=excluded.organization_defaults,department_templates=excluded.department_templates,
  agent_template_refs=excluded.agent_template_refs,governance_profile=excluded.governance_profile,
  memory_structure_template=excluded.memory_structure_template,onboarding_questions=excluded.onboarding_questions,
  launch_configuration=excluded.launch_configuration,catalog_slug=excluded.catalog_slug,industry_tags=excluded.industry_tags,
  recommended_for=excluded.recommended_for,compatibility_contract=excluded.compatibility_contract,
  function_coverage=excluded.function_coverage,integration_family_coverage=excluded.integration_family_coverage,
  generic_connector_fallback=excluded.generic_connector_fallback,updated_at=now();
