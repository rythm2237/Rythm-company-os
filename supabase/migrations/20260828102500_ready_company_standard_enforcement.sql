-- RYTHM OS — enforce Ready Company Minimum Standard v1 at the database boundary.

begin;

alter table public.company_templates
  drop constraint if exists company_templates_stable_minimum_standard_check;
alter table public.company_templates
  add constraint company_templates_stable_minimum_standard_check check (
    maturity <> 'stable' or (
      minimum_standard_version is not null
      and generic_connector_fallback = true
      and function_coverage ?& array[
        'executive_operations','finance_accounting','legal_compliance','people_workforce',
        'sales_crm_client','communications_support','industry_delivery','analytics_reporting',
        'security_permissions_audit','human_ceo_authority'
      ]
      and coalesce((function_coverage->>'human_ceo_authority')::boolean,false) = true
      and integration_family_coverage @> array[
        'productivity','accounting_erp','payments_banking','crm_sales','website_cms','analytics_bi',
        'legal_contracts','people_hris','project_work','file_storage','generic_business_api'
      ]::text[]
    )
  ) not valid;

alter table public.company_templates validate constraint company_templates_stable_minimum_standard_check;

alter table public.company_templates
  drop constraint if exists company_templates_advertising_extension_check;
alter table public.company_templates
  add constraint company_templates_advertising_extension_check check (
    company_type <> 'Advertising Agency' or maturity <> 'stable' or (
      integration_family_coverage @> array[
        'meta_marketing','google_ads','youtube','tiktok_business','linkedin_marketing'
      ]::text[]
      and coalesce((compatibility_contract->>'spend_requires_human_ceo')::boolean,false) = true
    )
  ) not valid;

alter table public.company_templates validate constraint company_templates_advertising_extension_check;

commit;
