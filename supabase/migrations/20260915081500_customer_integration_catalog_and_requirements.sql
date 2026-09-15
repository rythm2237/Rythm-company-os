-- RYTHM Company OS — customer-facing integration catalog and requirement profiles
--
-- Connections are always company-owned. Projects bind an exact external resource later.
-- A provider being in the catalog does not mean it is connected or authorized.
-- Requirement profiles are defaults for Ready Companies; project analysis may promote a
-- recommended connection to required when a specific project scope depends on it.

begin;

-- Permit project/company planners to express a real blocking dependency without making every
-- provider mandatory for every company template.
alter table public.company_template_integration_requirements
  drop constraint if exists company_template_integration_requiremen_requirement_level_check;
alter table public.company_template_integration_requirements
  add constraint company_template_integration_requiremen_requirement_level_check
  check (requirement_level in ('required','recommended','optional')) not valid;
alter table public.company_template_integration_requirements
  validate constraint company_template_integration_requiremen_requirement_level_check;

insert into public.integration_providers
  (provider_key, display_name, category, supports_oauth, supports_token, enabled, version, allowed_environments, kill_switch, updated_at)
values
  ('google_search_console','Google Search Console','seo_search',true,false,true,'1.0.0',array['production','preview'],false,now()),
  ('google_analytics','Google Analytics 4','analytics',true,false,true,'1.0.0',array['production','preview'],false,now()),
  ('google_drive','Google Drive','file_storage',true,false,true,'1.0.0',array['production','preview'],false,now()),
  ('google_business_profile','Google Business Profile','local_marketing',true,false,true,'1.0.0',array['production','preview'],false,now()),
  ('figma','Figma','design',true,true,true,'1.0.0',array['production','preview'],false,now()),
  ('ahrefs','Ahrefs','seo_research',false,true,true,'1.0.0',array['production','preview'],false,now()),
  ('semrush','Semrush','seo_research',false,true,true,'1.0.0',array['production','preview'],false,now()),
  ('slack','Slack','communication',true,true,true,'1.0.0',array['production','preview'],false,now()),
  ('microsoft_teams','Microsoft Teams','communication',true,true,true,'1.0.0',array['production','preview'],false,now())
on conflict (provider_key) do update set
  display_name=excluded.display_name,
  category=excluded.category,
  supports_oauth=excluded.supports_oauth,
  supports_token=excluded.supports_token,
  enabled=excluded.enabled,
  version=excluded.version,
  allowed_environments=excluded.allowed_environments,
  kill_switch=false,
  updated_at=now();

-- Existing useful catalog entries should be visible in the customer connection center. Enabling
-- a provider only makes the setup entry available; it never marks an organization connection live.
update public.integration_providers
set enabled=true, updated_at=now()
where provider_key in (
  'google_ads','meta_marketing','youtube','tiktok_business','linkedin_marketing',
  'website_cms','file_storage','analytics_bi','crm_sales','project_work','legal_contracts'
);

-- Software / web-delivery operating model. Source control and deployment are expected for normal
-- software delivery; design, DNS/edge and data services are useful but scope-dependent.
insert into public.company_template_integration_requirements
  (company_template_key,provider_key,requirement_level,purpose)
values
  ('ready_software_company_v1','github','recommended','Source control, pull requests and governed code delivery.'),
  ('ready_software_company_v1','vercel','recommended','Preview and production deployment visibility for web projects.'),
  ('ready_software_company_v1','supabase','recommended','Database/backend resource discovery when a project uses Supabase.'),
  ('ready_software_company_v1','figma','optional','Design handoff and implementation context when a project uses Figma.'),
  ('ready_software_company_v1','cloudflare','optional','DNS, edge and web delivery operations when the client uses Cloudflare.'),
  ('ready_software_company_v1','google_drive','optional','Client briefs, assets and deliverable exchange.'),
  ('ready_saas_startup_v1','github','recommended','Source control and governed code delivery.'),
  ('ready_saas_startup_v1','vercel','recommended','Deployment and release evidence for the SaaS product.'),
  ('ready_saas_startup_v1','supabase','optional','Backend/data operations when the SaaS product uses Supabase.'),
  ('ready_saas_startup_v1','google_analytics','recommended','Product/marketing outcome measurement.'),
  ('ready_saas_startup_v1','google_search_console','optional','Organic search visibility when the SaaS product has a public website.'),
  ('ready_saas_startup_v1','figma','optional','Design workspace access for product/design work.'),
  ('ready_saas_startup_v1','cloudflare','optional','DNS and edge operations when used by the product.'),
  ('ready_ai_advertising_agency_v1','google_analytics','recommended','Traffic, conversion and campaign outcome evidence.'),
  ('ready_ai_advertising_agency_v1','google_search_console','recommended','SEO/search performance evidence for organic discovery projects.'),
  ('ready_ai_advertising_agency_v1','google_ads','optional','Search/display campaign execution when included in scope.'),
  ('ready_ai_advertising_agency_v1','meta_marketing','optional','Meta advertising/publishing when included in scope.'),
  ('ready_ai_advertising_agency_v1','linkedin_marketing','optional','B2B advertising/publishing when included in scope.'),
  ('ready_ai_advertising_agency_v1','youtube','optional','Video/channel work when included in scope.'),
  ('ready_ai_advertising_agency_v1','tiktok_business','optional','TikTok advertising/publishing when included in scope.'),
  ('ready_ai_advertising_agency_v1','github','optional','Website/code implementation when the client site is repository-managed.'),
  ('ready_ai_advertising_agency_v1','vercel','optional','Deployment evidence when the client site is hosted on Vercel.'),
  ('ready_ai_advertising_agency_v1','website_cms','optional','Content/CMS implementation when organic or campaign work requires site changes.'),
  ('ready_ai_advertising_agency_v1','google_drive','optional','Client briefs, creative assets and reports.'),
  ('ready_ai_advertising_agency_v1','figma','optional','Creative/design assets when used by the client or agency.'),
  ('ready_ai_advertising_agency_v1','ahrefs','optional','Third-party SEO research and backlink evidence.'),
  ('ready_ai_advertising_agency_v1','semrush','optional','Third-party SEO/market research evidence.')
on conflict (company_template_key,provider_key) do update set
  requirement_level=excluded.requirement_level,
  purpose=excluded.purpose;

commit;
