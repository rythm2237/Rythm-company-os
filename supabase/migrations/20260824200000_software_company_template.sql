-- RYTHM OS — production Software Company template
-- Additive, tenant-isolated and credential-free.

begin;

-- The reusable Agent catalog needs explicit professional and economic metadata.
alter table public.agent_templates
  add column if not exists canonical_role text,
  add column if not exists role_family text,
  add column if not exists default_specializations text[] not null default '{}',
  add column if not exists default_model_policy jsonb not null default '{"mode":"adaptive","allowEscalation":true,"maxEscalations":2,"maxRetries":1,"costStrategy":"balanced"}'::jsonb,
  add column if not exists default_language_policy jsonb not null default '{"mode":"automatic"}'::jsonb,
  add column if not exists monthly_company_cost numeric(12,2) not null default 0 check (monthly_company_cost >= 0),
  add column if not exists cost_currency text not null default 'EUR',
  add column if not exists cost_model text not null default 'included' check (cost_model in ('included','fixed','usage','hybrid','custom')),
  add column if not exists sale_price_monthly numeric(12,2) check (sale_price_monthly is null or sale_price_monthly >= 0);

create table if not exists public.company_template_workflows (
  workflow_key text not null,
  version text not null,
  company_template_key text not null,
  name text not null,
  description text not null,
  stages jsonb not null default '[]'::jsonb,
  completion_evidence jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (workflow_key, version)
);

create table if not exists public.company_template_meeting_types (
  company_template_key text not null,
  meeting_key text not null,
  name text not null,
  purpose text not null,
  default_participant_template_keys text[] not null default '{}',
  decision_required boolean not null default false,
  active boolean not null default true,
  primary key (company_template_key, meeting_key)
);

create table if not exists public.company_template_integration_profiles (
  company_template_key text not null,
  agent_template_key text not null,
  provider_key text not null references public.integration_providers(provider_key) on delete cascade,
  capability_key text not null,
  approval_mode text not null check (approval_mode in ('autonomous','approval_required','human_only')),
  scope jsonb not null default '{}'::jsonb,
  primary key (company_template_key, agent_template_key, provider_key, capability_key)
);

create table if not exists public.company_template_integration_requirements (
  company_template_key text not null,
  provider_key text not null references public.integration_providers(provider_key) on delete cascade,
  requirement_level text not null check (requirement_level in ('recommended','optional')),
  purpose text not null,
  primary key (company_template_key, provider_key)
);

create table if not exists public.organization_setup_dependencies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  template_key text not null,
  dependency_type text not null,
  dependency_key text not null,
  requirement_level text not null check (requirement_level in ('recommended','optional')),
  status text not null default 'pending' check (status in ('pending','connected','not_needed','blocked')),
  detail text not null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, template_key, dependency_type, dependency_key)
);

alter table public.company_template_workflows enable row level security;
alter table public.company_template_meeting_types enable row level security;
alter table public.company_template_integration_profiles enable row level security;
alter table public.company_template_integration_requirements enable row level security;
alter table public.organization_setup_dependencies enable row level security;

create policy company_template_workflows_authenticated_read on public.company_template_workflows
  for select to authenticated using (active = true);
create policy company_template_meeting_types_authenticated_read on public.company_template_meeting_types
  for select to authenticated using (active = true);
create policy company_template_integration_profiles_authenticated_read on public.company_template_integration_profiles
  for select to authenticated using (true);
create policy company_template_integration_requirements_authenticated_read on public.company_template_integration_requirements
  for select to authenticated using (true);
create policy organization_setup_dependencies_member_read on public.organization_setup_dependencies
  for select to authenticated using (public.is_org_member(organization_id));
create policy organization_setup_dependencies_owner_write on public.organization_setup_dependencies
  for all to authenticated using (public.is_org_owner(organization_id)) with check (public.is_org_owner(organization_id));

revoke insert, update, delete, truncate on public.company_template_workflows from anon, authenticated;
revoke insert, update, delete, truncate on public.company_template_meeting_types from anon, authenticated;
revoke insert, update, delete, truncate on public.company_template_integration_profiles from anon, authenticated;
revoke insert, update, delete, truncate on public.company_template_integration_requirements from anon, authenticated;
grant select on public.company_template_workflows, public.company_template_meeting_types,
  public.company_template_integration_profiles, public.company_template_integration_requirements to authenticated;
grant select, insert, update, delete on public.organization_setup_dependencies to authenticated;

-- Integration catalogs are global read-only registries. They were previously exposed without RLS.
alter table public.integration_providers enable row level security;
alter table public.integration_capabilities enable row level security;
drop policy if exists integration_providers_authenticated_read on public.integration_providers;
create policy integration_providers_authenticated_read on public.integration_providers
  for select to authenticated using (enabled = true);
drop policy if exists integration_capabilities_authenticated_read on public.integration_capabilities;
create policy integration_capabilities_authenticated_read on public.integration_capabilities
  for select to authenticated using (true);
revoke insert, update, delete, truncate on public.integration_providers from anon, authenticated;
revoke insert, update, delete, truncate on public.integration_capabilities from anon, authenticated;
grant select on public.integration_providers, public.integration_capabilities to authenticated;

-- Authoritative professional sources used by the Software Company workforce.
insert into public.knowledge_source_registry
(id,source_name,publisher,base_domain,canonical_url,source_type,authority_level,allowed_role_families,allowed_topics,freshness_class,enabled,notes,last_verified_at,next_review_at)
values
('70000000-0000-0000-0000-000000000001','The Scrum Guide','Scrum Guides','scrumguides.org','https://scrumguides.org/','primary_reference','primary',array['general','technology'],array['product management','delivery planning','empiricism','accountability'],'slow_changing',true,'Official definition of Scrum by its authors; used as one delivery reference, not as a mandatory process.',now(),now()+interval '180 days'),
('70000000-0000-0000-0000-000000000002','Pull requests and protected branches','GitHub','docs.github.com','https://docs.github.com/pull-requests','official_documentation','primary',array['technology'],array['Git','branches','pull requests','reviews','protected branches'],'fast_changing',true,'Official GitHub delivery and review documentation.',now(),now()+interval '30 days'),
('70000000-0000-0000-0000-000000000003','Vercel Deployments and Observability','Vercel','vercel.com','https://vercel.com/docs/deployments','official_documentation','primary',array['technology'],array['deployments','preview','production','observability','rollback'],'fast_changing',true,'Official Vercel deployment documentation.',now(),now()+interval '30 days'),
('70000000-0000-0000-0000-000000000004','Supabase Database and RLS Documentation','Supabase','supabase.com','https://supabase.com/docs/guides/database/overview','official_documentation','primary',array['technology'],array['Postgres','RLS','migrations','Auth','tenant isolation'],'fast_changing',true,'Official Supabase database and security documentation.',now(),now()+interval '30 days'),
('70000000-0000-0000-0000-000000000005','PostgreSQL Current Documentation','PostgreSQL Global Development Group','postgresql.org','https://www.postgresql.org/docs/current/index.html','official_documentation','primary',array['technology'],array['PostgreSQL','relational design','indexes','transactions','performance'],'moderate',true,'Official PostgreSQL documentation; implementation must verify the deployed database version.',now(),now()+interval '60 days'),
('70000000-0000-0000-0000-000000000006','Cloudflare Developer Documentation','Cloudflare','developers.cloudflare.com','https://developers.cloudflare.com/','official_documentation','primary',array['technology'],array['DNS','Workers','domains','edge','security'],'fast_changing',true,'Official Cloudflare developer documentation.',now(),now()+interval '30 days'),
('70000000-0000-0000-0000-000000000007','Stripe Documentation','Stripe','docs.stripe.com','https://docs.stripe.com/','official_documentation','primary',array['technology','analytics'],array['payments','billing','webhooks','refunds','financial operations'],'fast_changing',true,'Official Stripe product and API documentation.',now(),now()+interval '30 days'),
('70000000-0000-0000-0000-000000000008','Secure Software Development Framework','NIST','nist.gov','https://csrc.nist.gov/pubs/sp/800/218/final','government','primary',array['technology'],array['secure development','software supply chain','security practices','risk'],'moderate',true,'NIST SP 800-218 SSDF reference.',now(),now()+interval '60 days'),
('70000000-0000-0000-0000-000000000009','Application Security Verification Standard','OWASP Foundation','owasp.org','https://owasp.org/www-project-application-security-verification-standard/','standards_body','primary',array['technology'],array['application security','verification','authentication','authorization','secure design'],'moderate',true,'OWASP ASVS control and verification reference.',now(),now()+interval '60 days'),
('70000000-0000-0000-0000-000000000010','Google Search Central SEO Guide','Google','developers.google.com','https://developers.google.com/search/docs/fundamentals/seo-starter-guide','official_documentation','primary',array['marketing','technology'],array['SEO','structured data','crawlability','search quality'],'moderate',true,'Official Google Search guidance. No ranking guarantees are inferred.',now(),now()+interval '60 days'),
('70000000-0000-0000-0000-000000000011','OpenAI Platform Documentation','OpenAI','platform.openai.com','https://platform.openai.com/docs/','official_documentation','primary',array['technology'],array['AI APIs','models','tools','evaluation','observability'],'fast_changing',true,'Official OpenAI platform documentation; model and API behavior must be verified when used.',now(),now()+interval '30 days'),
('70000000-0000-0000-0000-000000000012','Site Reliability Engineering','Google','sre.google','https://sre.google/sre-book/table-of-contents/','primary_reference','high',array['technology'],array['SRE','SLO','monitoring','release engineering','incident response'],'moderate',true,'Google SRE operational reference.',now(),now()+interval '90 days'),
('70000000-0000-0000-0000-000000000013','FinOps Framework','FinOps Foundation','finops.org','https://www.finops.org/framework/','professional_association','high',array['analytics','general'],array['FinOps','cloud cost','unit economics','budgeting','optimization'],'moderate',true,'FinOps Foundation operating framework.',now(),now()+interval '90 days')
on conflict (canonical_url) do update set
  source_name=excluded.source_name,publisher=excluded.publisher,base_domain=excluded.base_domain,
  allowed_role_families=excluded.allowed_role_families,allowed_topics=excluded.allowed_topics,
  freshness_class=excluded.freshness_class,enabled=true,notes=excluded.notes,
  last_verified_at=excluded.last_verified_at,next_review_at=excluded.next_review_at,updated_at=now();

-- Senior-depth role specializations. Runtime retrieval remains task-bounded.
insert into public.role_specializations
(id,role_family,specialization_key,title,version,knowledge_content,source_ids,qa_rules,freshness_class,last_verified_at,next_review_at,active)
values
('71000000-0000-0000-0000-000000000001','general','product_management','Senior Product Management','1',
 '[{"domain":"discovery and strategy","competencies":["frame customer problem and outcome","separate evidence from assumptions","define product vision, value proposition and measurable outcomes","evaluate scope, sequencing and opportunity cost"]},{"domain":"delivery ownership","methods":["roadmap by outcomes","backlog refinement","user story and acceptance-criteria review","release planning","stakeholder decision log"]},{"domain":"quality","rules":["do not treat generated text as shipped value","trace priorities to evidence and strategy","make scope changes explicit"]}]'::jsonb,
 array['70000000-0000-0000-0000-000000000001'::uuid],'["requirements are testable","priority rationale is explicit","release claims require evidence","material scope changes require CEO decision"]'::jsonb,'moderate',now(),now()+interval '90 days',true),
('71000000-0000-0000-0000-000000000002','general','customer_support_communications','Customer Support & Communications Operations','1',
 '[{"domain":"support operations","competencies":["triage severity and customer impact","maintain case ownership and response expectations","draft accurate empathetic replies","escalate security, legal, billing and incident cases"]},{"domain":"communication governance","rules":["distinguish draft from sent communication","verify product facts and customer context","preserve confidentiality and audit trail"]}]'::jsonb,
 '{}'::uuid[],'["no autonomous external sending by default","no invented resolution or timeline","material customer commitments require approval"]'::jsonb,'moderate',now(),now()+interval '90 days',true),
('71000000-0000-0000-0000-000000000003','general','sales_crm','B2B Sales & CRM Operations','1',
 '[{"domain":"commercial lifecycle","competencies":["qualify needs and decision process","maintain CRM hygiene and next steps","prepare proposals from approved scope and pricing","manage handoff and renewal signals"]},{"domain":"commercial governance","rules":["never invent price, authority or customer acceptance","keep commitments traceable","escalate non-standard terms"]}]'::jsonb,
 '{}'::uuid[],'["proposal matches approved catalog","customer facts are sourced","non-standard commercial commitments require approval"]'::jsonb,'moderate',now(),now()+interval '90 days',true),
('71000000-0000-0000-0000-000000000004','general','people_ai_workforce_ops','People & AI Workforce Operations','1',
 '[{"domain":"workforce design","competencies":["define role purpose and accountability","map reporting and collaboration","identify capacity and skill gaps","onboard human and AI workforce with explicit permissions"]},{"domain":"performance governance","rules":["use evidence and role-appropriate measures","separate capability from credentials","escalate employment and regulated HR decisions"]}]'::jsonb,
 '{}'::uuid[],'["no fabricated credentials","no autonomous employment decision","permissions and tenant boundaries remain explicit"]'::jsonb,'moderate',now(),now()+interval '90 days',true),
('71000000-0000-0000-0000-000000000005','analytics','finops_accounting','Finance Operations & FinOps','1',
 '[{"domain":"operating finance","competencies":["classify revenue, expense and cash effects","monitor budget and margin","reconcile periods and evidence","coordinate invoice workflows without claiming statutory authority"]},{"domain":"FinOps","competencies":["allocate cloud and AI cost","track unit economics and usage drivers","forecast spend","recommend optimization without degrading required reliability"]}]'::jsonb,
 array['70000000-0000-0000-0000-000000000007'::uuid,'70000000-0000-0000-0000-000000000013'::uuid],'["reconcile calculations","state accounting assumptions","no invented financial entries","licensed statutory work remains human-governed"]'::jsonb,'moderate',now(),now()+interval '90 days',true),
('71000000-0000-0000-0000-000000000006','technology','software_architecture','Principal Software & Solution Architecture','1',
 '[{"domain":"architecture","competencies":["define system boundaries and quality attributes","evaluate build-buy-integrate decisions","design tenant, identity, data and integration boundaries","record architecture decisions and trade-offs"]},{"domain":"evolution","methods":["risk-first spikes","dependency mapping","capacity and failure-mode review","backward-compatible migration design","technical review gates"]}]'::jsonb,
 array['70000000-0000-0000-0000-000000000002'::uuid,'70000000-0000-0000-0000-000000000008'::uuid],'["architecture traces to requirements","cost and operational implications are explicit","high-impact decisions retain alternatives and rollback path"]'::jsonb,'fast_changing',now(),now()+interval '30 days',true),
('71000000-0000-0000-0000-000000000007','technology','frontend_engineering','Senior Frontend Engineering','1',
 '[{"domain":"frontend systems","competencies":["component and state architecture","semantic accessible UI","responsive behavior","typed client-server contracts","rendering and performance analysis","unit, integration and visual regression testing"]}]'::jsonb,
 array['50000000-0000-0000-0000-000000000006'::uuid,'50000000-0000-0000-0000-000000000008'::uuid,'10000000-0000-0000-0000-000000000001'::uuid],'["critical flows are keyboard accessible","responsive states are tested","client bundles contain no secrets","implementation evidence is required"]'::jsonb,'fast_changing',now(),now()+interval '30 days',true),
('71000000-0000-0000-0000-000000000008','technology','backend_engineering','Senior Backend & API Engineering','1',
 '[{"domain":"backend systems","competencies":["API and domain-service design","server-side validation","authentication and authorization boundaries","idempotency and background processing","integration failure handling","observability and testability"]}]'::jsonb,
 array['70000000-0000-0000-0000-000000000008'::uuid,'50000000-0000-0000-0000-000000000010'::uuid],'["authorization is enforced server-side","inputs are validated","retries are idempotent","error and audit evidence are preserved"]'::jsonb,'fast_changing',now(),now()+interval '30 days',true),
('71000000-0000-0000-0000-000000000009','technology','postgres_database_engineering','Senior PostgreSQL & Multi-Tenant Database Engineering','1',
 '[{"domain":"relational design","competencies":["keys, constraints and transaction boundaries","migration sequencing and rollback planning","index and query-plan analysis","data lifecycle, backup and restore awareness"]},{"domain":"tenant security","competencies":["RLS policy design","grant minimization","security invoker and definer review","cross-tenant negative testing"]}]'::jsonb,
 array['70000000-0000-0000-0000-000000000004'::uuid,'70000000-0000-0000-0000-000000000005'::uuid],'["RLS enabled on exposed tenant tables","UPDATE has USING and WITH CHECK","production migrations need approval and verification","cross-tenant reads and writes are denied"]'::jsonb,'fast_changing',now(),now()+interval '30 days',true),
('71000000-0000-0000-0000-000000000010','technology','devops_cloud','Senior DevOps, Cloud & Reliability Engineering','1',
 '[{"domain":"delivery platform","competencies":["branch and CI policy","environment separation","preview and production release","secrets and configuration","domain and DNS governance","rollback and incident readiness"]},{"domain":"reliability","methods":["SLO and signal selection","monitoring and alerting","capacity review","post-incident learning","toil reduction"]}]'::jsonb,
 array['70000000-0000-0000-0000-000000000002'::uuid,'70000000-0000-0000-0000-000000000003'::uuid,'70000000-0000-0000-0000-000000000006'::uuid,'70000000-0000-0000-0000-000000000012'::uuid],'["same artifact is promoted when possible","production and DNS changes are approved","rollback path is documented","READY status is verified"]'::jsonb,'fast_changing',now(),now()+interval '30 days',true),
('71000000-0000-0000-0000-000000000011','technology','quality_engineering','Senior Quality & Test Engineering','1',
 '[{"domain":"quality engineering","competencies":["risk-based test strategy","unit, integration, contract and E2E coverage","acceptance and regression design","defect reproduction and root-cause evidence","release and production smoke validation"]}]'::jsonb,
 array['70000000-0000-0000-0000-000000000008'::uuid],'["tests record conditions and observed results","critical negative paths are covered","a stage passes only with evidence","flaky or skipped tests are disclosed"]'::jsonb,'moderate',now(),now()+interval '60 days',true),
('71000000-0000-0000-0000-000000000012','technology','application_security','Senior Application Security Engineering','1',
 '[{"domain":"application security","competencies":["threat modeling","identity and access review","tenant isolation","secret and dependency risk","secure design and code review","security verification and residual-risk reporting"]}]'::jsonb,
 array['70000000-0000-0000-0000-000000000008'::uuid,'70000000-0000-0000-0000-000000000009'::uuid,'50000000-0000-0000-0000-000000000010'::uuid],'["verify authn and authz separately","test horizontal and vertical access","no secrets in source or logs","security pass requires recorded evidence"]'::jsonb,'moderate',now(),now()+interval '60 days',true),
('71000000-0000-0000-0000-000000000013','technology','technical_documentation','Senior Technical Writing & Documentation Engineering','1',
 '[{"domain":"documentation systems","competencies":["audience and task analysis","architecture and API documentation","user and administrator guidance","release notes and runbooks","version and ownership discipline"]}]'::jsonb,
 array['70000000-0000-0000-0000-000000000002'::uuid],'["commands and interfaces are verified","prerequisites and failure recovery are included","documentation version matches release evidence"]'::jsonb,'moderate',now(),now()+interval '90 days',true),
('71000000-0000-0000-0000-000000000014','technology','ai_automation','Senior AI & Automation Engineering','1',
 '[{"domain":"AI systems","competencies":["model and tool selection","prompt and context architecture","evaluation and regression design","agent workflow and permission boundaries","latency, cost and observability controls","human escalation"]},{"domain":"automation","rules":["make retries idempotent","bound tool authority","record execution evidence","separate model output from completed external work"]}]'::jsonb,
 array['70000000-0000-0000-0000-000000000011'::uuid,'50000000-0000-0000-0000-000000000004'::uuid,'50000000-0000-0000-0000-000000000005'::uuid],'["evaluate before promotion","tool permissions are least privilege","model cost is measurable","unsafe or uncertain actions escalate"]'::jsonb,'fast_changing',now(),now()+interval '30 days',true),
('71000000-0000-0000-0000-000000000015','marketing','geo_growth','SEO, GEO & Product Growth Engineering','1',
 '[{"domain":"discoverability","competencies":["technical SEO","structured data and crawlability","content and entity clarity","AI-answer discoverability without deceptive claims","performance and conversion instrumentation"]}]'::jsonb,
 array['70000000-0000-0000-0000-000000000010'::uuid],'["no ranking or AI-citation guarantees","structured data matches visible facts","indexing controls are verified","growth measurement preserves denominator and attribution caveats"]'::jsonb,'moderate',now(),now()+interval '60 days',true)
on conflict (role_family,specialization_key,version) do update set
  title=excluded.title,knowledge_content=excluded.knowledge_content,source_ids=excluded.source_ids,
  qa_rules=excluded.qa_rules,freshness_class=excluded.freshness_class,last_verified_at=excluded.last_verified_at,
  next_review_at=excluded.next_review_at,active=true,updated_at=now();

-- Reusable professional Agent definitions. Customer instances are materialized per tenant.
insert into public.agent_templates (
  template_key,version,name,role,role_code,department_template_key,reports_to_template_key,
  purpose,responsibilities,skills,work_style,kpis,success_criteria,default_authority_level,
  default_risk_ceiling,default_human_approval_requirements,default_allowed_tools,
  default_memory_scope,default_language,system_instructions_template,runtime_policy_key,
  budget_policy_key,is_active,canonical_role,role_family,default_specializations,
  default_model_policy,default_language_policy,monthly_company_cost,cost_currency,cost_model,sale_price_monthly
) values
('software_chief_of_staff','1.0','Chief of Staff','Chief of Staff / Operations Manager','SW-CHIEF-STAFF','executive_operations',null,
 'Coordinate the software company, its delivery portfolio, dependencies, meetings, decisions and executive escalations.',
 '["Coordinate projects and cross-department handoffs","Prepare executive meetings and decisions","Track dependencies, blockers and follow-through","Escalate material scope, cost, risk and authority gaps"]',
 '["Executive orchestration","Operations management","Dependency management","Decision preparation"],
 'Structured, concise, asynchronous-first and explicit about owners, evidence and blockers.',
 '["Blocked dependencies surfaced","Decisions prepared with evidence","Approved actions followed through"]',
 '["No material commitment without authority","No stage completion without evidence"]',2,'high',
 '["Business strategy changes","Material scope or cost changes","Production release","Destructive or external commitments"]',
 '["company_memory","projects","meetings","decisions","actions","approvals","calendar","notifications"]','organization','English',
 'You are the governed Chief of Staff. Coordinate specialists without replacing their professional judgement. Preserve dissent, assign owners and surface blockers. Never self-approve consequential work or claim execution without evidence.',
 'multi_provider_v1','organization_metered_v1',true,'Executive Orchestrator & AI Chief of Staff','general',array['executive_orchestration'],
 '{"mode":"adaptive","minimumTier":"terra","maximumTier":"sol","allowEscalation":true,"maxEscalations":2,"maxRetries":1,"costStrategy":"balanced"}','{"mode":"automatic"}',0,'EUR','included',null),

('software_finance_manager','1.0','Finance Manager','Finance Manager / Accountant','SW-FINANCE','finance_legal','software_chief_of_staff',
 'Maintain operating finance, workforce and infrastructure cost visibility, budget control, margin analysis and governed financial workflows.',
 '["Track operating revenue and expense evidence","Monitor AI, API and cloud cost","Maintain budgets, margin and unit economics","Coordinate invoice and finance workflows","Escalate statutory and material finance decisions"]',
 '["Management accounting","Budgeting","FinOps","Unit economics","Financial controls"],
 'Reconciled, evidence-led and careful to distinguish operating records from statutory accounting.',
 '["Costs reconciled","Budget variance visible","Margin and unit economics current"]',
 '["No invented entries","Statutory work remains licensed-human governed"]',2,'high',
 '["Refunds","New spending","Budget changes","Tax or statutory conclusions"]',
 '["finance","billing","projects","decisions","actions","stripe.billing.read"]','organization','English',
 'You are the governed Finance Manager. Maintain operating financial visibility and FinOps evidence. You are not a substitute for a licensed statutory accountant. Never initiate spend, refunds or binding financial commitments without required approval.',
 'multi_provider_v1','organization_metered_v1',true,'Finance Operations Manager','analytics',array['finance','finops_accounting'],
 default,'{"mode":"automatic"}',0,'EUR','included',null),

('software_legal_compliance_counsel','1.0','Legal & Compliance Counsel','Legal & Compliance Counsel','SW-LEGAL','finance_legal','software_chief_of_staff',
 'Provide governed legal issue-spotting across contracts, privacy, GDPR, licensing, intellectual property and vendor risk.',
 '["Review contracts and DPAs","Triage privacy, GDPR and software compliance","Review licensing, IP and subprocessors","Escalate jurisdiction-specific or high-stakes matters"]',
 '["Contract analysis","Privacy","GDPR","Software licensing","Risk escalation"],
 'Current-source, jurisdiction-aware and explicit about the boundary between issue-spotting and licensed advice.',
 '["Material legal issues surfaced","Current authority checked","Counsel-required matters escalated"]',
 '["No fabricated law","No claim of licensed authority"]',1,'high',
 '["Binding legal position","Non-standard contracts","Material privacy risk","Licensed counsel required"]',
 '["company_memory","projects","meetings","decisions","approvals","communication_drafts"]','organization','English',
 'You are governed Legal & Compliance Counsel for issue-spotting and workflow coordination. Verify current authoritative sources, identify jurisdiction and missing facts, and escalate when licensed counsel or human legal authority is required.',
 'multi_provider_v1','organization_metered_v1',true,'Legal & Compliance Advisor','legal',array['contracts','privacy','compliance'],
 '{"mode":"adaptive","minimumTier":"terra","maximumTier":"sol","allowEscalation":true,"maxEscalations":2,"maxRetries":1,"costStrategy":"quality"}','{"mode":"automatic"}',0,'EUR','included',null),

('software_communications_support_manager','1.0','Communications & Customer Support Manager','Communications & Customer Support Manager','RYTHM-COMMS','growth_customer','software_chief_of_staff',
 'Own company communication triage, customer support, release communication and governed escalation.',
 '["Triage inbound correspondence and support cases","Draft accurate customer responses","Coordinate escalation and follow-up","Prepare release and incident communication"]',
 '["Support operations","Communication triage","Customer empathy","Release communication"],
 'Responsive, accurate, calm and conservative about promises.',
 '["Cases have owners","Response facts verified","Urgent issues escalated"]',
 '["No autonomous external sending by default","No invented resolution or delivery date"]',2,'high',
 '["External email send","Material customer commitment","Security, legal or billing escalation"]',
 '["communication_inbox","communication_routing","communication_drafts","calendar","notifications"]','organization','English',
 'You are the governed Communications & Customer Support Manager. Read, classify, summarize, route and draft. Never send externally or make material customer commitments without the configured approval.',
 'multi_provider_v1','organization_metered_v1',true,'Customer Support & Communications Manager','general',array['customer_support_communications'],
 default,'{"mode":"automatic"}',0,'EUR','included',null),

('software_sales_crm_manager','1.0','Sales & CRM Manager','Sales / CRM Manager','SW-SALES-CRM','growth_customer','software_chief_of_staff',
 'Manage leads, CRM records, opportunities, proposals, lifecycle follow-up and commercial handoffs.',
 '["Qualify leads and needs","Maintain CRM and opportunity next steps","Prepare proposals from approved scope and catalog","Coordinate commercial follow-up and handoff"]',
 '["B2B sales","CRM operations","Discovery","Proposal coordination"],
 'Customer-centered, commercially disciplined and traceable.',
 '["CRM records current","Opportunities have next steps","Proposals match approved scope"]',
 '["No invented price or authority","Non-standard commitments escalate"]',2,'high',
 '["External proposal or email","Discount or non-standard term","Commercial commitment"]',
 '["crm","communication_drafts","calendar","projects","decisions","actions"]','organization','English',
 'You are the governed Sales & CRM Manager. Maintain evidence-based commercial records and drafts. Never invent pricing, scope, authority or customer acceptance. External communication and non-standard commitments require approval.',
 'multi_provider_v1','organization_metered_v1',true,'B2B Sales & CRM Manager','general',array['sales_crm'],
 default,'{"mode":"automatic"}',0,'EUR','included',null),

('software_people_workforce_manager','1.0','People & AI Workforce Operations Manager','People & AI Workforce Operations Manager','SW-PEOPLE-OPS','executive_operations','software_chief_of_staff',
 'Maintain organization design, workforce capacity, role quality, utilization, performance evidence and onboarding.',
 '["Maintain role and reporting structure","Review Agent utilization and performance evidence","Identify capacity and skill gaps","Coordinate human and AI onboarding"]',
 '["Organization design","Workforce planning","Capability analysis","Onboarding governance"],
 'Evidence-led, role-conscious and careful with employment and identity boundaries.',
 '["Roles have accountable scope","Capacity gaps visible","Onboarding controls complete"]',
 '["No fabricated credential","No autonomous employment decision"]',1,'high',
 '["Employment decision","Permission expansion","Agent transfer or archive with material impact"]',
 '["agents","company_structure","evaluations","projects","actions"]','organization','English',
 'You are the governed People & AI Workforce Operations Manager. Optimize structure and capability without fabricating credentials or making autonomous employment decisions. Keep permissions and tenant boundaries explicit.',
 'multi_provider_v1','organization_metered_v1',true,'People & AI Workforce Operations Manager','general',array['people_ai_workforce_ops'],
 default,'{"mode":"automatic"}',0,'EUR','included',null),

('software_product_manager','1.0','Product Manager','Senior Product Manager','SW-PRODUCT','product','software_chief_of_staff',
 'Own product discovery, vision, scope, roadmap, prioritization, acceptance criteria and release planning.',
 '["Lead product discovery and problem framing","Define vision, outcomes and roadmap","Prioritize scope and user stories","Own acceptance criteria and release planning"]',
 '["Product discovery","Product strategy","Roadmapping","Prioritization","Acceptance criteria"],
 'Outcome-focused, evidence-seeking and explicit about assumptions and trade-offs.',
 '["Requirements trace to outcomes","Priorities have rationale","Releases have acceptance evidence"]',
 '["Generated text is not shipped value","Material scope changes escalate"]',2,'high',
 '["Material scope or strategy change","Pricing or commercial commitment","Production acceptance"]',
 '["company_memory","projects","meetings","decisions","actions","crm"]','organization','English',
 'You are the Senior Product Manager. Own product decisions within approved strategy, derive testable requirements and never mark delivery complete without implementation and acceptance evidence. Escalate material scope and strategy changes.',
 'multi_provider_v1','organization_metered_v1',true,'Senior Product Manager','general',array['product_management'],
 default,'{"mode":"automatic"}',0,'EUR','included',null),

('software_business_analyst','1.0','Senior Business Analyst','Senior Business Analyst','SW-BA','product','software_product_manager',
 'Discover and formalize functional, non-functional, process and business-rule requirements with traceable acceptance evidence.',
 '["Elicit and analyze requirements","Map processes and workflows","Define business rules and non-functional requirements","Maintain requirement and acceptance traceability"]',
 '["Business analysis","Process modeling","Requirements engineering","Acceptance criteria"],
 'Precise, skeptical of ambiguity and explicit about facts, assumptions and decisions.',
 '["Requirements testable","Business rules consistent","Gaps surfaced before implementation"]',
 '["No invented stakeholder requirement","Conflicts and ambiguity are recorded"]',1,'medium',
 '["Material requirement conflict","Scope implication","Regulatory requirement"]',
 '["company_memory","projects","meetings","decisions","actions"]','organization','English',
 'You are the Senior Business Analyst. Convert evidence and stakeholder input into precise traceable requirements. Never invent requirements. Surface conflicts, gaps and material scope implications for decision.',
 'multi_provider_v1','organization_metered_v1',true,'Senior Business Analyst','analytics',array['business_analysis'],
 default,'{"mode":"automatic"}',0,'EUR','included',null),

('software_cto_architect','1.0','CTO / Principal Solution Architect','CTO / Principal Solution Architect','SW-CTO','engineering','software_chief_of_staff',
 'Own technical strategy, solution architecture, technology selection, quality attributes and major technical risk.',
 '["Define architecture and system boundaries","Select technology with evidence and trade-offs","Own integration, scalability and reliability strategy","Review implementation and major technical risk","Record architecture decisions"]',
 '["Solution architecture","Technical strategy","Distributed systems","Integration architecture","Architecture review"],
 'Principal-level, risk-first and explicit about reversibility, cost and operational burden.',
 '["Architecture decisions traceable","Quality attributes testable","Technical risks have owners and mitigations"]',
 '["No architecture approval without evidence","Material cost and risk decisions escalate"]',3,'high',
 '["Material architecture or vendor choice","Significant cost exposure","Production exception","Security boundary change"]',
 '["company_memory","projects","meetings","decisions","actions","github.repo.read","vercel.deployment.read","supabase.schema.read","supabase.sql.read","cloudflare.dns.read"]','organization','English',
 'You are the CTO / Principal Solution Architect. Make reversible low-risk technical decisions within approved scope, record material trade-offs, and review implementation evidence. Escalate architecture choices that materially affect cost, security, data or strategy.',
 'multi_provider_v1','organization_metered_v1',true,'Principal Solution Architect','technology',array['software_architecture'],
 '{"mode":"adaptive","minimumTier":"terra","maximumTier":"sol","allowEscalation":true,"maxEscalations":2,"maxRetries":1,"costStrategy":"quality"}','{"mode":"automatic"}',0,'EUR','included',null),

('software_product_designer','1.0','Senior UX/UI Product Designer','Senior UX/UI Product Designer','SW-DESIGN','design','software_product_manager',
 'Own user journeys, information architecture, interaction design, design systems, accessibility-aware specifications and visual QA.',
 '["Interpret user research","Define journeys and information architecture","Create wireframes and production UI specifications","Maintain design system and responsive accessibility","Perform visual QA"]',
 '["Product design","UI/UX","Design systems","Accessibility","Responsive design"],
 'User-centered, system-oriented and implementation-aware.',
 '["Critical journeys coherent","States and edge cases specified","Accessibility and responsive QA recorded"]',
 '["Concept is not implementation","Design approval requires review evidence"]',2,'medium',
 '["Material brand or journey change","Accessibility exception","Customer-facing release acceptance"]',
 '["company_memory","projects","meetings","decisions","actions","design_artifacts"]','organization','English',
 'You are the Senior UX/UI Product Designer. Produce implementation-ready, accessible and responsive specifications. Distinguish concepts from implemented UI and require visual evidence before passing visual QA.',
 'multi_provider_v1','organization_metered_v1',true,'Senior Product Designer','design',array['ui_ux','product_design'],
 default,'{"mode":"automatic"}',0,'EUR','included',null),

('software_frontend_engineer','1.0','Senior Frontend Engineer','Senior Frontend Engineer','SW-FRONTEND','engineering','software_cto_architect',
 'Own frontend architecture, implementation, component systems, responsive accessibility, performance and frontend tests.',
 '["Implement frontend architecture and components","Integrate typed server contracts","Ensure responsive and accessible behavior","Test critical frontend paths","Review frontend performance"]',
 '["React","Next.js","TypeScript","Accessibility","Frontend testing","Web performance"],
 'Small-batch, test-backed and faithful to approved product/design requirements.',
 '["Build passes","Frontend tests pass","Responsive and accessibility evidence recorded"]',
 '["Code output alone is not completion","No direct protected-branch or Production change"]',2,'medium',
 '["Protected branch merge","Production deployment","Material design or scope deviation"]',
 '["company_memory","projects","actions","github.repo.read","github.branch.create","github.code.write","github.pull_request.create","vercel.deployment.read"]','organization','English',
 'You are the Senior Frontend Engineer. Implement approved requirements on isolated branches with tests and traceability. Never claim completion without artifacts and executed validation. Do not merge protected branches or deploy Production without governed approval.',
 'multi_provider_v1','organization_metered_v1',true,'Senior Frontend Engineer','technology',array['web_development','frontend_engineering'],
 default,'{"mode":"automatic"}',0,'EUR','included',null),

('software_backend_engineer','1.0','Senior Backend Engineer','Senior Backend Engineer','SW-BACKEND','engineering','software_cto_architect',
 'Own APIs, domain logic, server architecture, authentication integration, authorization, integrations and background work.',
 '["Implement APIs and business logic","Enforce authentication and authorization","Build idempotent integrations and background processing","Create backend tests and observability"]',
 '["API design","Server architecture","Authorization","Integration engineering","Background jobs","Backend testing"],
 'Contract-first, secure-by-default and failure-aware.',
 '["API contracts verified","Authorization negative tests pass","Failure and retry behavior evidenced"]',
 '["No privileged secret in client or logs","No direct protected-branch merge"]',2,'high',
 '["Security boundary change","Production migration","Protected branch merge","External side effect"]',
 '["company_memory","projects","actions","github.repo.read","github.branch.create","github.code.write","github.pull_request.create","supabase.schema.read","supabase.sql.read"]','organization','English',
 'You are the Senior Backend Engineer. Implement approved server requirements with validation, least privilege, idempotency, tests and observability. Never claim an external effect or deployment without governed execution evidence.',
 'multi_provider_v1','organization_metered_v1',true,'Senior Backend Engineer','technology',array['web_development','backend_engineering'],
 default,'{"mode":"automatic"}',0,'EUR','included',null),

('software_database_engineer','1.0','Senior Database Engineer','Senior Database Engineer','SW-DATABASE','engineering','software_cto_architect',
 'Own relational design, migrations, integrity, indexing, performance, RLS, tenant isolation and data lifecycle.',
 '["Design relational schemas and constraints","Create reversible migrations","Review indexes and query behavior","Enforce RLS and tenant isolation","Plan backup-aware data lifecycle"]',
 '["PostgreSQL","Schema design","Migrations","RLS","Query performance","Tenant isolation"],
 'Integrity-first, migration-disciplined and adversarial about cross-tenant access.',
 '["Migration verified","RLS negative tests pass","Integrity and rollback evidence recorded"]',
 '["Production migration needs approval","Production data deletion is Human Only"]',2,'high',
 '["Production migration","RLS or authorization boundary change","Destructive data operation"]',
 '["company_memory","projects","actions","github.repo.read","github.branch.create","github.code.write","github.pull_request.create","supabase.schema.read","supabase.sql.read","supabase.migration.apply"]','organization','English',
 'You are the Senior Database Engineer. Design for integrity, tenant isolation and reversible change. Apply no Production migration without approval and never perform destructive Production data operations as an Agent.',
 'multi_provider_v1','organization_metered_v1',true,'Senior PostgreSQL Database Engineer','technology',array['postgres_database_engineering'],
 '{"mode":"adaptive","minimumTier":"terra","maximumTier":"sol","allowEscalation":true,"maxEscalations":2,"maxRetries":1,"costStrategy":"quality"}','{"mode":"automatic"}',0,'EUR','included',null),

('software_devops_cloud_engineer','1.0','Senior DevOps / Cloud Engineer','Senior DevOps / Cloud Engineer','SW-DEVOPS','engineering','software_cto_architect',
 'Own Git workflow, CI/CD, environments, Vercel, Cloudflare, configuration, observability, release and rollback operations.',
 '["Maintain Git and CI/CD workflow","Operate Preview and governed Production releases","Manage environment and secret references","Coordinate domain and DNS changes","Monitor runtime and maintain rollback readiness"]',
 '["CI/CD","GitHub","Vercel","Cloudflare","Observability","Incident response","Release engineering"],
 'Automation-oriented, same-artifact disciplined and rollback-ready.',
 '["CI gates enforced","Preview verified","Production READY and smoke evidence recorded"]',
 '["Production and DNS writes require approval","Project deletion is Human Only"]',3,'high',
 '["PR merge","Production deploy","DNS write","New spending or destructive infrastructure change"]',
 '["company_memory","projects","actions","github.repo.read","github.branch.create","github.pull_request.create","github.pull_request.merge","vercel.deployment.read","vercel.preview.deploy","vercel.production.deploy","cloudflare.dns.read","cloudflare.dns.write"]','organization','English',
 'You are the Senior DevOps / Cloud Engineer. Use isolated changes, CI gates, Preview validation and auditable releases. Production deploy, merge and DNS writes require configured approval. Never delete projects or change credential ownership.',
 'multi_provider_v1','organization_metered_v1',true,'Senior DevOps & Cloud Engineer','technology',array['devops_cloud'],
 '{"mode":"adaptive","minimumTier":"terra","maximumTier":"sol","allowEscalation":true,"maxEscalations":2,"maxRetries":1,"costStrategy":"quality"}','{"mode":"automatic"}',0,'EUR','included',null),

('software_qa_test_engineer','1.0','Senior QA / Test Engineer','Senior QA / Test Engineer','SW-QA','quality_security','software_chief_of_staff',
 'Own risk-based test strategy, regression, acceptance, release validation, defect reproduction and Production smoke testing.',
 '["Define test strategy and evidence requirements","Review unit, integration and E2E coverage","Run regression and acceptance validation","Reproduce defects","Perform release and Production smoke tests"]',
 '["Test strategy","E2E testing","Regression","Acceptance testing","Defect analysis","Release validation"],
 'Independent, reproducible and evidence-first.',
 '["Critical paths tested","Defects reproducible","Release result records conditions and evidence"]',
 '["No QA pass from generated text","Skipped or flaky coverage disclosed"]',2,'high',
 '["Accepting unresolved critical defect","Production release recommendation with residual high risk"]',
 '["company_memory","projects","actions","github.repo.read","vercel.deployment.read","test_evidence"]','organization','English',
 'You are the independent Senior QA / Test Engineer. Pass a stage only with executed, reproducible evidence. Cover success, validation, authorization, failure and regression paths, and disclose skipped or flaky tests.',
 'multi_provider_v1','organization_metered_v1',true,'Senior Quality Engineer','technology',array['quality_engineering'],
 default,'{"mode":"automatic"}',0,'EUR','included',null),

('software_application_security_engineer','1.0','Senior Application Security Engineer','Senior Application Security Engineer','SW-SECURITY','quality_security','software_chief_of_staff',
 'Own security architecture review, threat modeling, identity, authorization, RLS, secrets, dependencies and secure release evidence.',
 '["Threat-model material changes","Review authentication, authorization and tenant isolation","Assess secret and dependency risk","Perform secure design and release review","Record residual risk"]',
 '["Threat modeling","Application security","Authorization testing","RLS review","OWASP","Secure SDLC"],
 'Independent, adversarial and explicit about residual risk.',
 '["Threats and controls traceable","Access-control negative tests pass","Residual risk recorded"]',
 '["No security pass without evidence","Critical unresolved risk blocks release"]',2,'high',
 '["Security exception","Production release with material residual risk","Credential or permission change"]',
 '["company_memory","projects","meetings","decisions","approvals","github.repo.read","vercel.deployment.read","supabase.schema.read","supabase.sql.read"]','organization','English',
 'You are the independent Senior Application Security Engineer. Test security boundaries and tenant isolation, preserve evidence and residual risk, and block or escalate unresolved critical risk. Never request or expose secrets.',
 'multi_provider_v1','organization_metered_v1',true,'Senior Application Security Engineer','technology',array['application_security'],
 '{"mode":"adaptive","minimumTier":"terra","maximumTier":"sol","allowEscalation":true,"maxEscalations":2,"maxRetries":1,"costStrategy":"quality"}','{"mode":"automatic"}',0,'EUR','included',null),

('software_seo_geo_growth_engineer','1.0','SEO / GEO & Growth Engineer','SEO / GEO & Growth Engineer','SW-GROWTH','growth_customer','software_chief_of_staff',
 'Own technical SEO, structured data, sitemap, robots, AI discoverability, performance implications and conversion instrumentation.',
 '["Review crawlability and index controls","Implement factual structured data","Improve SEO and GEO content/entity clarity","Coordinate performance and conversion instrumentation","Measure growth with attribution caveats"]',
 '["Technical SEO","Structured data","GEO","Web performance","Conversion analytics"],
 'Experiment-led, technically grounded and opposed to ranking guarantees or deceptive markup.',
 '["Search controls verified","Structured data matches visible facts","Growth instrumentation reconciled"]',
 '["No ranking or citation guarantee","No deceptive structured data"]',2,'medium',
 '["Material public claim","Tracking with privacy impact","Production release"]',
 '["company_memory","projects","actions","github.repo.read","github.branch.create","github.code.write","github.pull_request.create","vercel.deployment.read"]','organization','English',
 'You are the SEO / GEO & Growth Engineer. Implement technically sound discoverability and measurement without ranking or AI-citation guarantees. Structured data and public claims must match verified visible facts.',
 'multi_provider_v1','organization_metered_v1',true,'SEO / GEO & Growth Engineer','marketing',array['seo','geo_growth'],
 default,'{"mode":"automatic"}',0,'EUR','included',null),

('software_technical_writer','1.0','Technical Writer / Documentation Engineer','Technical Writer / Documentation Engineer','SW-DOCS','product','software_cto_architect',
 'Own architecture, API, release, user, administrator and runbook documentation with release-level version discipline.',
 '["Maintain architecture and API documentation","Write user and administrator guidance","Prepare release notes","Create operating and incident runbooks","Verify commands and prerequisites"]',
 '["Technical writing","API documentation","Information architecture","Runbooks","Release notes"],
 'Audience-aware, testable and version-disciplined.',
 '["Docs match release","Commands verified","Recovery and ownership clear"]',
 '["No undocumented invented capability","No release note without artifact evidence"]',1,'medium',
 '["Customer-facing material claim","Security-sensitive documentation","Legal wording"]',
 '["company_memory","projects","actions","github.repo.read","github.branch.create","github.code.write","github.pull_request.create"]','organization','English',
 'You are the Technical Writer / Documentation Engineer. Make documentation task-oriented, versioned and verifiable. Do not document nonexistent features or unverified commands, and protect security-sensitive detail.',
 'multi_provider_v1','organization_metered_v1',true,'Senior Technical Documentation Engineer','technology',array['technical_documentation'],
 default,'{"mode":"automatic"}',0,'EUR','included',null),

('software_ai_automation_engineer','1.0','AI / Automation Engineer','Senior AI / Automation Engineer','SW-AI-AUTOMATION','engineering','software_cto_architect',
 'Own AI functionality, model integrations, Agent workflows, automation architecture, evaluation, observability and cost controls.',
 '["Design AI and automation architecture","Integrate models and governed tools","Create evaluation and regression suites","Implement AI observability and cost controls","Define fallback and human escalation"]',
 '["AI systems","Agent workflows","Automation","Evaluation","Observability","AI cost control"],
 'Evaluation-first, permission-bounded and explicit about model uncertainty.',
 '["Evaluations gate promotion","Tool authority bounded","Latency and cost observable"]',
 '["Model output is not external execution","Unsafe uncertainty escalates"]',2,'high',
 '["New model or provider with material cost/risk","External tool authority","Production AI promotion"]',
 '["company_memory","projects","actions","github.repo.read","github.branch.create","github.code.write","github.pull_request.create","vercel.deployment.read","supabase.schema.read"]','organization','English',
 'You are the Senior AI / Automation Engineer. Build evaluated, observable and cost-controlled AI systems with least-privilege tools and explicit human escalation. Never equate model output with completed external execution.',
 'multi_provider_v1','organization_metered_v1',true,'Senior AI & Automation Engineer','technology',array['ai_automation'],
 '{"mode":"adaptive","minimumTier":"terra","maximumTier":"sol","allowEscalation":true,"maxEscalations":2,"maxRetries":1,"costStrategy":"quality"}','{"mode":"automatic"}',0,'EUR','included',null)
on conflict (template_key,version) do update set
  name=excluded.name,role=excluded.role,role_code=excluded.role_code,
  department_template_key=excluded.department_template_key,reports_to_template_key=excluded.reports_to_template_key,
  purpose=excluded.purpose,responsibilities=excluded.responsibilities,skills=excluded.skills,work_style=excluded.work_style,
  kpis=excluded.kpis,success_criteria=excluded.success_criteria,default_authority_level=excluded.default_authority_level,
  default_risk_ceiling=excluded.default_risk_ceiling,default_human_approval_requirements=excluded.default_human_approval_requirements,
  default_allowed_tools=excluded.default_allowed_tools,system_instructions_template=excluded.system_instructions_template,
  canonical_role=excluded.canonical_role,role_family=excluded.role_family,default_specializations=excluded.default_specializations,
  default_model_policy=excluded.default_model_policy,default_language_policy=excluded.default_language_policy,
  monthly_company_cost=excluded.monthly_company_cost,cost_currency=excluded.cost_currency,cost_model=excluded.cost_model,
  sale_price_monthly=excluded.sale_price_monthly,is_active=true,updated_at=now();

-- Reusable operating system: seven departments, one evidence-gated workflow and governed launch defaults.
insert into public.company_templates (
  template_key,name,company_type,category,description,positioning,version,status,owner_name,
  supported_product_codes,organization_defaults,department_templates,agent_template_refs,
  workflow_template_refs,governance_profile,memory_structure_template,onboarding_questions,launch_configuration
) values (
  'ready_software_company_v1','Software Company','software_company','Ready Companies',
  'A reusable AI software company for product discovery, design, engineering, quality, security, release, growth and customer operations under Human CEO authority.',
  'From product idea to governed production operation, using organization-owned Agents, evidence gates and least-privilege integrations.',
  '1.0','active','RYTHM',array['company_studio'],
  '{"operating_language":"English","delivery_model":"evidence_gated","human_ceo_authority":true,"external_actions_allowed":false}'::jsonb,
  '[
    {"key":"executive_operations","name":"Executive & Operations","description":"Executive coordination, operating cadence and workforce governance."},
    {"key":"product","name":"Product","description":"Discovery, requirements, analysis and product documentation."},
    {"key":"design","name":"Design","description":"Product experience, interaction and visual design."},
    {"key":"engineering","name":"Engineering","description":"Architecture, application, data, platform and AI delivery."},
    {"key":"quality_security","name":"Quality & Security","description":"Independent quality assurance and application security review."},
    {"key":"growth_customer","name":"Growth & Customer","description":"Sales, CRM, discoverability, communications and customer support."},
    {"key":"finance_legal","name":"Finance & Legal","description":"Finance operations, FinOps, legal issue spotting and compliance coordination."}
  ]'::jsonb,
  array[
    'software_chief_of_staff','software_finance_manager','software_legal_compliance_counsel',
    'software_communications_support_manager','software_sales_crm_manager','software_people_workforce_manager',
    'software_product_manager','software_business_analyst','software_cto_architect','software_product_designer',
    'software_frontend_engineer','software_backend_engineer','software_database_engineer','software_devops_cloud_engineer',
    'software_qa_test_engineer','software_application_security_engineer','software_seo_geo_growth_engineer',
    'software_technical_writer','software_ai_automation_engineer'
  ],
  array['software_product_delivery_v1'],
  '{"human_ceo_authority":true,"external_actions_default":false,"high_risk_requires_approval":true,"restricted_actions":"human_only","production_release_requires_approval":true,"production_migrations_require_approval":true,"protected_branch_merge_requires_approval":true,"tenant_isolation_required":true}'::jsonb,
  '{"scopes":["company","product","architecture","projects","customers","operations"],"professional_knowledge_platform_managed":true,"company_knowledge_tenant_owned":true,"cross_tenant_memory":false}'::jsonb,
  '[
    {"key":"company_mission","label":"What mission and customer problem should this company pursue?","type":"long_text","required":true},
    {"key":"target_customer","label":"Who is the initial target customer or user?","type":"long_text","required":true},
    {"key":"product_stage","label":"What is the current product stage?","type":"select","options":["idea","discovery","prototype","beta","production"]},
    {"key":"operating_constraints","label":"What budget, deadline, jurisdiction, security or technology constraints are known?","type":"long_text"},
    {"key":"preferred_language","label":"Primary operating language","type":"text"}
  ]'::jsonb,
  '{"agent_count":19,"agents_initial_status":"paused","external_actions_allowed":false,"first_project_blueprint":"software_product_delivery_v1","first_action":"Capture the founder/customer product brief.","integration_credentials_copied":false}'::jsonb
)
on conflict (template_key,version) do update set
  name=excluded.name,company_type=excluded.company_type,category=excluded.category,description=excluded.description,
  positioning=excluded.positioning,status='active',supported_product_codes=excluded.supported_product_codes,
  organization_defaults=excluded.organization_defaults,department_templates=excluded.department_templates,
  agent_template_refs=excluded.agent_template_refs,workflow_template_refs=excluded.workflow_template_refs,
  governance_profile=excluded.governance_profile,memory_structure_template=excluded.memory_structure_template,
  onboarding_questions=excluded.onboarding_questions,launch_configuration=excluded.launch_configuration,updated_at=now();

insert into public.company_template_workflows
  (workflow_key,version,company_template_key,name,description,stages,completion_evidence)
values (
  'software_product_delivery_v1','1.0','ready_software_company_v1','Software Product Delivery',
  'Evidence-gated delivery from an unvalidated idea through operation and iteration. Stages are planning records, never claims of completion.',
  '[
    {"key":"IDEA","name":"Idea","owner":"software_product_manager"},
    {"key":"DISCOVERY","name":"Discovery","owner":"software_product_manager"},
    {"key":"REQUIREMENTS","name":"Requirements","owner":"software_business_analyst"},
    {"key":"PRODUCT_DEFINITION","name":"Product Definition","owner":"software_product_manager"},
    {"key":"ARCHITECTURE","name":"Architecture","owner":"software_cto_architect"},
    {"key":"DESIGN","name":"Design","owner":"software_product_designer"},
    {"key":"IMPLEMENTATION","name":"Implementation","owner":"software_cto_architect"},
    {"key":"CODE_REVIEW","name":"Code Review","owner":"software_cto_architect"},
    {"key":"QA","name":"Quality Assurance","owner":"software_qa_test_engineer"},
    {"key":"SECURITY_REVIEW","name":"Security Review","owner":"software_application_security_engineer"},
    {"key":"PREVIEW","name":"Preview","owner":"software_devops_cloud_engineer"},
    {"key":"ACCEPTANCE","name":"Acceptance","owner":"software_product_manager"},
    {"key":"PRODUCTION_APPROVAL","name":"Production Approval","owner":"software_chief_of_staff","approval_required":true},
    {"key":"DEPLOY","name":"Deploy","owner":"software_devops_cloud_engineer","approval_required":true},
    {"key":"MONITOR","name":"Monitor","owner":"software_devops_cloud_engineer"},
    {"key":"SUPPORT","name":"Support","owner":"software_communications_support_manager"},
    {"key":"ITERATE","name":"Iterate","owner":"software_product_manager"}
  ]'::jsonb,
  '{
    "DISCOVERY":["customer/problem brief","assumptions and evidence log"],
    "REQUIREMENTS":["approved requirements","testable acceptance criteria"],
    "ARCHITECTURE":["architecture decision record","risk and rollback notes"],
    "DESIGN":["reviewed responsive design","accessibility considerations"],
    "CODE_REVIEW":["pull request","review outcome","passing CI"],
    "QA":["test report","critical-path and negative-path results"],
    "SECURITY_REVIEW":["threat/control review","residual risks"],
    "PREVIEW":["READY preview deployment","smoke result"],
    "ACCEPTANCE":["acceptance evidence","open exceptions"],
    "PRODUCTION_APPROVAL":["Human CEO approval"],
    "DEPLOY":["production deployment reference","migration result when applicable","rollback readiness"],
    "MONITOR":["health signals","incident ownership"],
    "ITERATE":["measured learning","next decision"]
  }'::jsonb
)
on conflict (workflow_key,version) do update set
  company_template_key=excluded.company_template_key,name=excluded.name,description=excluded.description,
  stages=excluded.stages,completion_evidence=excluded.completion_evidence,active=true,updated_at=now();

insert into public.company_template_meeting_types
  (company_template_key,meeting_key,name,purpose,default_participant_template_keys,decision_required)
values
('ready_software_company_v1','product_discovery','Product Discovery','Validate the problem, customer, outcome and key assumptions.',array['software_product_manager','software_business_analyst','software_product_designer'],true),
('ready_software_company_v1','architecture_review','Architecture Review','Review quality attributes, boundaries, trade-offs, risks and rollback.',array['software_cto_architect','software_backend_engineer','software_database_engineer','software_devops_cloud_engineer','software_application_security_engineer'],true),
('ready_software_company_v1','delivery_planning','Delivery Planning','Agree the next evidence-bearing slice, ownership and dependencies.',array['software_chief_of_staff','software_product_manager','software_cto_architect','software_qa_test_engineer'],true),
('ready_software_company_v1','design_review','Design Review','Review usability, accessibility, responsive states and implementation readiness.',array['software_product_designer','software_product_manager','software_frontend_engineer','software_qa_test_engineer'],true),
('ready_software_company_v1','technical_review','Technical Review','Review implementation quality, tests, operability and change risk.',array['software_cto_architect','software_frontend_engineer','software_backend_engineer','software_database_engineer'],true),
('ready_software_company_v1','qa_release_review','QA Release Review','Review test evidence, regressions, defects and release exceptions.',array['software_qa_test_engineer','software_product_manager','software_cto_architect'],true),
('ready_software_company_v1','security_review','Security Review','Review threat model, tenant isolation, credentials, dependencies and residual risks.',array['software_application_security_engineer','software_cto_architect','software_devops_cloud_engineer'],true),
('ready_software_company_v1','go_live_review','Go-Live Review','Present exact production action, evidence, rollback and approvals.',array['software_chief_of_staff','software_product_manager','software_cto_architect','software_devops_cloud_engineer','software_qa_test_engineer','software_application_security_engineer'],true),
('ready_software_company_v1','incident_review','Incident / Post-Launch Review','Assess customer impact, evidence, response, recovery and learning without blame.',array['software_chief_of_staff','software_devops_cloud_engineer','software_communications_support_manager','software_application_security_engineer'],true)
on conflict (company_template_key,meeting_key) do update set
  name=excluded.name,purpose=excluded.purpose,default_participant_template_keys=excluded.default_participant_template_keys,
  decision_required=excluded.decision_required,active=true;

insert into public.company_template_integration_requirements
  (company_template_key,provider_key,requirement_level,purpose)
values
('ready_software_company_v1','github','recommended','Source control, protected review and traceable delivery evidence.'),
('ready_software_company_v1','vercel','recommended','Preview and production deployment evidence.'),
('ready_software_company_v1','supabase','recommended','Database, Auth and tenant-isolation delivery.'),
('ready_software_company_v1','cloudflare','optional','Domain, DNS and edge operations when used by the product.'),
('ready_software_company_v1','stripe','optional','Billing and payment operations when used by the product.'),
('ready_software_company_v1','google_workspace','optional','Company calendar and governed external communication.'),
('ready_software_company_v1','microsoft_365','optional','Company calendar and governed external communication.')
on conflict (company_template_key,provider_key) do update set
  requirement_level=excluded.requirement_level,purpose=excluded.purpose;

-- Recommended grants are applied only to a customer-owned connected integration. No credential is stored here.
insert into public.company_template_integration_profiles
  (company_template_key,agent_template_key,provider_key,capability_key,approval_mode,scope)
values
('ready_software_company_v1','software_cto_architect','github','repo.read','autonomous','{"repository":"customer_selected"}'),
('ready_software_company_v1','software_cto_architect','github','branch.create','autonomous','{"protected_branches":false}'),
('ready_software_company_v1','software_cto_architect','github','code.write','autonomous','{"protected_branches":false}'),
('ready_software_company_v1','software_cto_architect','github','pull_request.create','autonomous','{"repository":"customer_selected"}'),
('ready_software_company_v1','software_cto_architect','github','pull_request.merge','approval_required','{"protected_branches":true}'),
('ready_software_company_v1','software_frontend_engineer','github','repo.read','autonomous','{"repository":"customer_selected"}'),
('ready_software_company_v1','software_frontend_engineer','github','branch.create','autonomous','{"protected_branches":false}'),
('ready_software_company_v1','software_frontend_engineer','github','code.write','autonomous','{"protected_branches":false}'),
('ready_software_company_v1','software_frontend_engineer','github','pull_request.create','autonomous','{"repository":"customer_selected"}'),
('ready_software_company_v1','software_backend_engineer','github','repo.read','autonomous','{"repository":"customer_selected"}'),
('ready_software_company_v1','software_backend_engineer','github','branch.create','autonomous','{"protected_branches":false}'),
('ready_software_company_v1','software_backend_engineer','github','code.write','autonomous','{"protected_branches":false}'),
('ready_software_company_v1','software_backend_engineer','github','pull_request.create','autonomous','{"repository":"customer_selected"}'),
('ready_software_company_v1','software_database_engineer','github','repo.read','autonomous','{"repository":"customer_selected"}'),
('ready_software_company_v1','software_database_engineer','github','branch.create','autonomous','{"protected_branches":false}'),
('ready_software_company_v1','software_database_engineer','github','code.write','autonomous','{"protected_branches":false}'),
('ready_software_company_v1','software_database_engineer','github','pull_request.create','autonomous','{"repository":"customer_selected"}'),
('ready_software_company_v1','software_devops_cloud_engineer','github','repo.read','autonomous','{"repository":"customer_selected"}'),
('ready_software_company_v1','software_devops_cloud_engineer','github','pull_request.merge','approval_required','{"protected_branches":true}'),
('ready_software_company_v1','software_qa_test_engineer','github','repo.read','autonomous','{"repository":"customer_selected"}'),
('ready_software_company_v1','software_application_security_engineer','github','repo.read','autonomous','{"repository":"customer_selected"}'),
('ready_software_company_v1','software_technical_writer','github','repo.read','autonomous','{"repository":"customer_selected"}'),
('ready_software_company_v1','software_technical_writer','github','branch.create','autonomous','{"protected_branches":false}'),
('ready_software_company_v1','software_technical_writer','github','code.write','autonomous','{"protected_branches":false}'),
('ready_software_company_v1','software_technical_writer','github','pull_request.create','autonomous','{"repository":"customer_selected"}'),
('ready_software_company_v1','software_ai_automation_engineer','github','repo.read','autonomous','{"repository":"customer_selected"}'),
('ready_software_company_v1','software_ai_automation_engineer','github','branch.create','autonomous','{"protected_branches":false}'),
('ready_software_company_v1','software_ai_automation_engineer','github','code.write','autonomous','{"protected_branches":false}'),
('ready_software_company_v1','software_ai_automation_engineer','github','pull_request.create','autonomous','{"repository":"customer_selected"}'),
('ready_software_company_v1','software_devops_cloud_engineer','vercel','deployment.read','autonomous','{"project":"customer_selected"}'),
('ready_software_company_v1','software_devops_cloud_engineer','vercel','preview.deploy','autonomous','{"environment":"preview"}'),
('ready_software_company_v1','software_devops_cloud_engineer','vercel','production.deploy','approval_required','{"environment":"production"}'),
('ready_software_company_v1','software_qa_test_engineer','vercel','deployment.read','autonomous','{"environment":"preview"}'),
('ready_software_company_v1','software_application_security_engineer','vercel','deployment.read','autonomous','{"environment":"preview"}'),
('ready_software_company_v1','software_database_engineer','supabase','schema.read','autonomous','{"project":"customer_selected"}'),
('ready_software_company_v1','software_database_engineer','supabase','sql.read','autonomous','{"read_only":true}'),
('ready_software_company_v1','software_database_engineer','supabase','migration.apply','approval_required','{"environment":"customer_selected"}'),
('ready_software_company_v1','software_backend_engineer','supabase','schema.read','autonomous','{"project":"customer_selected"}'),
('ready_software_company_v1','software_backend_engineer','supabase','sql.read','autonomous','{"read_only":true}'),
('ready_software_company_v1','software_application_security_engineer','supabase','schema.read','autonomous','{"project":"customer_selected"}'),
('ready_software_company_v1','software_application_security_engineer','supabase','sql.read','autonomous','{"read_only":true}'),
('ready_software_company_v1','software_devops_cloud_engineer','cloudflare','dns.read','autonomous','{"zone":"customer_selected"}'),
('ready_software_company_v1','software_devops_cloud_engineer','cloudflare','dns.write','approval_required','{"zone":"customer_selected"}'),
('ready_software_company_v1','software_finance_manager','stripe','billing.read','autonomous','{"account":"customer_selected"}'),
('ready_software_company_v1','software_finance_manager','stripe','refund.create','approval_required','{"account":"customer_selected"}'),
('ready_software_company_v1','software_sales_crm_manager','stripe','billing.read','autonomous','{"account":"customer_selected"}'),
('ready_software_company_v1','software_chief_of_staff','google_workspace','calendar.read','autonomous','{"calendar":"customer_selected"}'),
('ready_software_company_v1','software_communications_support_manager','google_workspace','calendar.read','autonomous','{"calendar":"customer_selected"}'),
('ready_software_company_v1','software_communications_support_manager','google_workspace','calendar.write','approval_required','{"calendar":"customer_selected"}'),
('ready_software_company_v1','software_communications_support_manager','google_workspace','email.send','approval_required','{"external":true}'),
('ready_software_company_v1','software_sales_crm_manager','google_workspace','calendar.read','autonomous','{"calendar":"customer_selected"}'),
('ready_software_company_v1','software_sales_crm_manager','google_workspace','calendar.write','approval_required','{"calendar":"customer_selected"}'),
('ready_software_company_v1','software_sales_crm_manager','google_workspace','email.send','approval_required','{"external":true}'),
('ready_software_company_v1','software_chief_of_staff','microsoft_365','calendar.read','autonomous','{"calendar":"customer_selected"}'),
('ready_software_company_v1','software_communications_support_manager','microsoft_365','calendar.read','autonomous','{"calendar":"customer_selected"}'),
('ready_software_company_v1','software_communications_support_manager','microsoft_365','calendar.write','approval_required','{"calendar":"customer_selected"}'),
('ready_software_company_v1','software_communications_support_manager','microsoft_365','email.send','approval_required','{"external":true}'),
('ready_software_company_v1','software_sales_crm_manager','microsoft_365','calendar.read','autonomous','{"calendar":"customer_selected"}'),
('ready_software_company_v1','software_sales_crm_manager','microsoft_365','calendar.write','approval_required','{"calendar":"customer_selected"}'),
('ready_software_company_v1','software_sales_crm_manager','microsoft_365','email.send','approval_required','{"external":true}')
on conflict (company_template_key,agent_template_key,provider_key,capability_key) do update set
  approval_mode=excluded.approval_mode,scope=excluded.scope;

alter table public.action_items
  add column if not exists project_id uuid references public.projects(id) on delete cascade;
create index if not exists action_items_project_idx on public.action_items(organization_id,project_id,status);

-- Internal materializer used by both full-company and individual-template provisioning.
create or replace function public.materialize_agent_template_v1(
  target_org_id uuid,
  target_agent_template_key text,
  target_agent_template_version text default '1.0',
  allow_existing_role_code boolean default false
)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  v_template public.agent_templates%rowtype;
  v_agent_id uuid;
  v_existing_status text;
  v_foundation public.role_foundations%rowtype;
  v_specialization public.role_specializations%rowtype;
  v_specialization_key text;
begin
  select * into v_template
  from public.agent_templates
  where template_key=trim(target_agent_template_key)
    and version=trim(target_agent_template_version)
    and is_active=true;
  if v_template.id is null then raise exception 'Active Agent template not found'; end if;

  select id,agent_status into v_agent_id,v_existing_status from public.agents
  where organization_id=target_org_id and agent_code=v_template.role_code
  for update;
  if v_agent_id is not null and v_existing_status<>'archived' and not allow_existing_role_code then
    raise exception 'This Agent template is already present in the organization';
  end if;

  if v_agent_id is null then
    v_agent_id:=gen_random_uuid();
    insert into public.agents(
      id,organization_id,agent_template_id,department_id,agent_code,name,role_title,purpose,
      authority_level,risk_ceiling,enabled,specification_version,identity,permissions,is_ai,
      responsibilities,skills,work_style,language,system_instructions,kpis,success_criteria,
      human_approval_requirements,allowed_tools,memory_scope,external_actions_allowed,
      runtime_provider,runtime_model,runtime_policy_key,budget_policy_key,agent_status,template_version,
      raw_role_title,canonical_role,role_family,specializations,provisioning_status,provisioning_started_at,
      provisioned_at,company_knowledge_connected,model_policy,language_policy,routing_policy_key
    ) values (
      v_agent_id,target_org_id,v_template.id,
      (select id from public.departments where organization_id=target_org_id and template_key=v_template.department_template_key),
      v_template.role_code,v_template.name,v_template.role,v_template.purpose,
      v_template.default_authority_level,v_template.default_risk_ceiling,false,v_template.version,
      jsonb_build_object('is_ai',true,'template_key',v_template.template_key,'template_version',v_template.version,'professional_knowledge_verified',true),
      jsonb_build_object('external_actions_allowed',false,'human_ceo_governed',true,'human_approval_requirements',v_template.default_human_approval_requirements),
      true,v_template.responsibilities,v_template.skills,v_template.work_style,v_template.default_language,
      v_template.system_instructions_template,v_template.kpis,v_template.success_criteria,
      v_template.default_human_approval_requirements,v_template.default_allowed_tools,
      v_template.default_memory_scope,false,'OpenAI',null,v_template.runtime_policy_key,v_template.budget_policy_key,
      'paused',v_template.version,v_template.role,v_template.canonical_role,v_template.role_family,
      v_template.default_specializations,'ready',now(),now(),true,v_template.default_model_policy,
      v_template.default_language_policy,'RYTHM_DEFAULT'
    );
  else
    update public.agents set
      agent_template_id=v_template.id,
      department_id=(select id from public.departments where organization_id=target_org_id and template_key=v_template.department_template_key),
      name=v_template.name,role_title=v_template.role,purpose=v_template.purpose,
      authority_level=v_template.default_authority_level,risk_ceiling=v_template.default_risk_ceiling,
      enabled=false,specification_version=v_template.version,
      identity=coalesce(identity,'{}'::jsonb)||jsonb_build_object('is_ai',true,'template_key',v_template.template_key,'template_version',v_template.version,'professional_knowledge_verified',true),
      permissions=jsonb_build_object('external_actions_allowed',false,'human_ceo_governed',true,'human_approval_requirements',v_template.default_human_approval_requirements),
      is_ai=true,responsibilities=v_template.responsibilities,skills=v_template.skills,work_style=v_template.work_style,
      language=v_template.default_language,system_instructions=v_template.system_instructions_template,
      kpis=v_template.kpis,success_criteria=v_template.success_criteria,
      human_approval_requirements=v_template.default_human_approval_requirements,allowed_tools=v_template.default_allowed_tools,
      memory_scope=v_template.default_memory_scope,external_actions_allowed=false,runtime_provider='OpenAI',runtime_model=null,
      runtime_policy_key=v_template.runtime_policy_key,budget_policy_key=v_template.budget_policy_key,
      agent_status='paused',template_version=v_template.version,raw_role_title=v_template.role,
      canonical_role=v_template.canonical_role,role_family=v_template.role_family,specializations=v_template.default_specializations,
      provisioning_status='ready',provisioning_error=null,provisioning_started_at=now(),provisioned_at=now(),
      company_knowledge_connected=true,model_policy=v_template.default_model_policy,
      language_policy=v_template.default_language_policy,routing_policy_key='RYTHM_DEFAULT',updated_at=now()
    where id=v_agent_id;
  end if;

  update public.agent_role_foundation_bindings set status='superseded'
  where organization_id=target_org_id and agent_id=v_agent_id and status='active';
  select * into v_foundation from public.role_foundations
  where role_family=v_template.role_family and status in ('active','validated')
    and (canonical_role=v_template.canonical_role or canonical_role is null)
  order by (canonical_role=v_template.canonical_role) desc,last_verified_at desc limit 1;
  if v_foundation.id is null then raise exception 'Professional foundation is unavailable for role family %',v_template.role_family; end if;
  insert into public.agent_role_foundation_bindings
    (organization_id,agent_id,role_foundation_id,foundation_version,status)
  values (target_org_id,v_agent_id,v_foundation.id,v_foundation.version,'active');

  update public.agent_specialization_bindings set status='detached'
  where organization_id=target_org_id and agent_id=v_agent_id and status='active';
  foreach v_specialization_key in array v_template.default_specializations loop
    select * into v_specialization from public.role_specializations
    where role_family=v_template.role_family and specialization_key=v_specialization_key and active=true
    order by last_verified_at desc limit 1;
    if v_specialization.id is null then raise exception 'Specialization % is unavailable for role family %',v_specialization_key,v_template.role_family; end if;
    insert into public.agent_specialization_bindings
      (organization_id,agent_id,specialization_id,status)
    values (target_org_id,v_agent_id,v_specialization.id,'active');
  end loop;

  perform public.verify_agent_mastery_v1(v_agent_id);
  insert into public.agent_knowledge_provisioning_events
    (organization_id,agent_id,event_type,role_family,canonical_role,metadata)
  values (target_org_id,v_agent_id,'template_materialized',v_template.role_family,v_template.canonical_role,
    jsonb_build_object('template_key',v_template.template_key,'template_version',v_template.version,'company_knowledge_connected',true));
  return v_agent_id;
end $$;
revoke all on function public.materialize_agent_template_v1(uuid,text,text,boolean) from public,anon,authenticated;

create or replace function public.provision_company_template_v2(
  target_org_id uuid,
  target_template_key text,
  target_template_version text default '1.0'
)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  v_user_id uuid:=auth.uid();
  v_template public.company_templates%rowtype;
  v_entitlement public.organization_entitlements%rowtype;
  v_installation_id uuid;
  v_department jsonb;
  v_agent_ref text;
  v_agent_template public.agent_templates%rowtype;
  v_reports_to_id uuid;
  v_missing_agents integer;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  if not public.is_org_owner(target_org_id) then raise exception 'Organization owner authority required'; end if;
  perform pg_advisory_xact_lock(hashtext(target_org_id::text));

  select * into v_entitlement from public.organization_entitlements where organization_id=target_org_id;
  if v_entitlement.id is null or v_entitlement.status<>'active' or not v_entitlement.company_template_access then
    raise exception 'Active Company Template access is required';
  end if;
  select * into v_template from public.company_templates
  where template_key=trim(target_template_key) and version=trim(target_template_version) and status='active';
  if v_template.id is null then raise exception 'Active company template not found'; end if;
  if not (v_entitlement.product_code=any(v_template.supported_product_codes)) then
    raise exception 'This template requires a supported Company Studio entitlement';
  end if;

  select id into v_installation_id from public.organization_template_installations
  where organization_id=target_org_id and template_key=v_template.template_key and template_version=v_template.version;
  if v_installation_id is not null then return v_installation_id; end if;

  -- Existing roster entries are accepted only when they are part of this exact reusable roster.
  if exists (
    select 1 from public.agents a left join public.agent_templates at on at.id=a.agent_template_id
    where a.organization_id=target_org_id and a.agent_status<>'archived'
      and a.agent_code<>'RYTHM-COMMS'
      and coalesce(at.template_key,'')<>all(v_template.agent_template_refs)
  ) then raise exception 'Template overlay is blocked because the organization contains an unrelated Agent roster'; end if;

  select count(*) into v_missing_agents
  from unnest(v_template.agent_template_refs) ref
  where not exists (
    select 1 from public.agent_templates at join public.agents a on a.agent_template_id=at.id
    where a.organization_id=target_org_id and a.agent_status<>'archived' and at.template_key=ref and at.version=v_template.version
  ) and not (ref='software_communications_support_manager' and exists(
    select 1 from public.agents a where a.organization_id=target_org_id and a.agent_code='RYTHM-COMMS' and a.agent_status<>'archived'
  ));
  if (select count(*) from public.agents where organization_id=target_org_id and agent_status<>'archived')+v_missing_agents>v_entitlement.max_active_agents then
    raise exception 'Agent limit is too low for this 19-Agent template';
  end if;
  if jsonb_array_length(v_template.department_templates)>v_entitlement.max_departments then
    raise exception 'Department limit is too low for this seven-department template';
  end if;

  for v_department in select value from jsonb_array_elements(v_template.department_templates) loop
    insert into public.departments(organization_id,template_key,name,description)
    values(target_org_id,v_department->>'key',v_department->>'name',v_department->>'description')
    on conflict(organization_id,template_key) do update set
      name=excluded.name,description=excluded.description,status='active',updated_at=now();
  end loop;

  foreach v_agent_ref in array v_template.agent_template_refs loop
    perform public.materialize_agent_template_v1(target_org_id,v_agent_ref,v_template.version,true);
  end loop;

  -- Resolve reporting lines only after all tenant-owned Agent instances exist.
  for v_agent_template in
    select * from public.agent_templates
    where template_key=any(v_template.agent_template_refs) and version=v_template.version and reports_to_template_key is not null
  loop
    select parent.id into v_reports_to_id
    from public.agents parent join public.agent_templates parent_template on parent_template.id=parent.agent_template_id
    where parent.organization_id=target_org_id and parent.agent_status<>'archived'
      and parent_template.template_key=v_agent_template.reports_to_template_key and parent_template.version=v_template.version;
    update public.agents set reports_to_agent_id=v_reports_to_id,updated_at=now()
    where organization_id=target_org_id and agent_template_id=v_agent_template.id and agent_status<>'archived';
  end loop;

  insert into public.organization_setup_dependencies
    (organization_id,template_key,dependency_type,dependency_key,requirement_level,status,detail,resolved_at)
  select target_org_id,v_template.template_key,'integration',r.provider_key,r.requirement_level,
    case when exists(select 1 from public.organization_integrations i where i.organization_id=target_org_id and i.provider_key=r.provider_key and i.status='connected') then 'connected' else 'pending' end,
    r.purpose,
    case when exists(select 1 from public.organization_integrations i where i.organization_id=target_org_id and i.provider_key=r.provider_key and i.status='connected') then now() else null end
  from public.company_template_integration_requirements r where r.company_template_key=v_template.template_key
  on conflict(organization_id,template_key,dependency_type,dependency_key) do update set
    requirement_level=excluded.requirement_level,status=excluded.status,detail=excluded.detail,resolved_at=excluded.resolved_at,updated_at=now();

  insert into public.organization_template_installations
    (organization_id,company_template_id,template_key,template_version,installed_by_user_id,configuration_snapshot)
  values(target_org_id,v_template.id,v_template.template_key,v_template.version,v_user_id,
    jsonb_build_object('company_template',v_template.template_key,'version',v_template.version,
      'departments',v_template.department_templates,'agent_template_refs',v_template.agent_template_refs,
      'workflow_template_refs',v_template.workflow_template_refs,'governance_profile',v_template.governance_profile,
      'agents_initial_status','paused','external_actions_allowed',false,'integration_credentials_copied',false))
  returning id into v_installation_id;

  insert into public.audit_events
    (organization_id,actor_type,actor_user_id,event_type,object_type,object_id,risk_level,payload)
  values(target_org_id,'user',v_user_id,'company_template.provisioned','company_template',v_template.id::text,'medium',
    jsonb_build_object('template_key',v_template.template_key,'template_version',v_template.version,
      'agent_count',cardinality(v_template.agent_template_refs),'agents_initial_status','paused',
      'external_actions_allowed',false,'credential_copy',false));
  return v_installation_id;
end $$;
revoke all on function public.provision_company_template_v2(uuid,text,text) from public,anon;
grant execute on function public.provision_company_template_v2(uuid,text,text) to authenticated;

create or replace function public.provision_agent_template_v1(
  target_org_id uuid,
  target_agent_template_key text,
  target_agent_template_version text default '1.0'
)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  v_user_id uuid:=auth.uid();
  v_template public.agent_templates%rowtype;
  v_company_template public.company_templates%rowtype;
  v_entitlement public.organization_entitlements%rowtype;
  v_department jsonb;
  v_agent_id uuid;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  if not public.is_org_owner(target_org_id) then raise exception 'Organization owner authority required'; end if;
  perform pg_advisory_xact_lock(hashtext(target_org_id::text));
  select * into v_entitlement from public.organization_entitlements where organization_id=target_org_id;
  if v_entitlement.id is null or v_entitlement.status<>'active' or not v_entitlement.agent_builder_enabled or not v_entitlement.agent_create_enabled then
    raise exception 'Active Agent creation access is required';
  end if;
  if (select count(*) from public.agents where organization_id=target_org_id and agent_status<>'archived')>=v_entitlement.max_active_agents then
    raise exception 'Agent limit reached for this organization';
  end if;
  select * into v_template from public.agent_templates
  where template_key=trim(target_agent_template_key) and version=trim(target_agent_template_version) and is_active=true;
  if v_template.id is null then raise exception 'Active Agent template not found'; end if;
  if exists(select 1 from public.agents where organization_id=target_org_id and agent_status<>'archived' and (agent_template_id=v_template.id or agent_code=v_template.role_code)) then
    raise exception 'This Agent template is already present in the organization';
  end if;

  select * into v_company_template from public.company_templates
  where v_template.template_key=any(agent_template_refs) and version=v_template.version and status='active'
  order by updated_at desc limit 1;
  select value into v_department from jsonb_array_elements(v_company_template.department_templates)
  where value->>'key'=v_template.department_template_key limit 1;
  if v_department is not null then
    if not exists(select 1 from public.departments where organization_id=target_org_id and template_key=v_template.department_template_key)
       and (select count(*) from public.departments where organization_id=target_org_id and status='active')>=v_entitlement.max_departments then
      raise exception 'Department limit reached for this organization';
    end if;
    insert into public.departments(organization_id,template_key,name,description)
    values(target_org_id,v_department->>'key',v_department->>'name',v_department->>'description')
    on conflict(organization_id,template_key) do update set status='active',updated_at=now();
  end if;
  v_agent_id:=public.materialize_agent_template_v1(target_org_id,v_template.template_key,v_template.version,false);
  insert into public.audit_events
    (organization_id,actor_type,actor_user_id,event_type,object_type,object_id,risk_level,payload)
  values(target_org_id,'user',v_user_id,'agent_template.provisioned','agent',v_agent_id::text,'low',
    jsonb_build_object('template_key',v_template.template_key,'template_version',v_template.version,
      'agent_status','paused','external_actions_allowed',false,'company_knowledge_connected',true));
  return v_agent_id;
end $$;
revoke all on function public.provision_agent_template_v1(uuid,text,text) from public,anon;
grant execute on function public.provision_agent_template_v1(uuid,text,text) to authenticated;

create or replace function public.start_software_project_blueprint_v1(
  target_org_id uuid,
  target_project_name text
)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  v_user_id uuid:=auth.uid();
  v_entitlement public.organization_entitlements%rowtype;
  v_workflow public.company_template_workflows%rowtype;
  v_project_id uuid:=gen_random_uuid();
  v_project_code text;
  v_sequence integer:=1;
  v_stage jsonb;
  v_product_manager_id uuid;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  if not public.is_org_owner(target_org_id) then raise exception 'Organization owner authority required'; end if;
  if length(trim(coalesce(target_project_name,'')))<2 or length(trim(target_project_name))>160 then
    raise exception 'Project name must contain 2 to 160 characters';
  end if;
  if not exists(select 1 from public.organization_template_installations where organization_id=target_org_id and template_key='ready_software_company_v1') then
    raise exception 'Install the Software Company template before starting its project blueprint';
  end if;
  select * into v_entitlement from public.organization_entitlements where organization_id=target_org_id and status='active';
  if v_entitlement.id is null then raise exception 'Active entitlement required'; end if;
  perform pg_advisory_xact_lock(hashtext(target_org_id::text));
  if (select count(*) from public.projects where organization_id=target_org_id and status not in ('completed','cancelled'))>=v_entitlement.max_projects then
    raise exception 'Project limit reached for this organization';
  end if;
  loop
    v_project_code:='SW-'||lpad(v_sequence::text,3,'0');
    exit when not exists(select 1 from public.projects where organization_id=target_org_id and project_code=v_project_code);
    v_sequence:=v_sequence+1;
  end loop;
  select * into v_workflow from public.company_template_workflows
  where workflow_key='software_product_delivery_v1' and version='1.0' and active=true;
  if v_workflow.workflow_key is null then raise exception 'Software delivery workflow is unavailable'; end if;

  insert into public.projects
    (id,organization_id,project_code,name,description,project_type,status,stage,priority,owner_type,objective,scope,success_criteria,constraints,created_by_user_id)
  values(v_project_id,target_org_id,v_project_code,trim(target_project_name),
    'Software product project created from the reusable Software Company workflow. Requirements and outcomes remain unvalidated until discovery evidence is recorded.',
    'saas_product','idea','idea',3,'human_ceo','Validate the customer problem and define an evidence-backed product outcome.',
    jsonb_build_object('workflow_key',v_workflow.workflow_key,'workflow_version',v_workflow.version,'template_key','ready_software_company_v1'),
    '[]'::jsonb,'["No production release without approval and evidence","No invented customer requirements"]'::jsonb,v_user_id);

  v_sequence:=1;
  for v_stage in select value from jsonb_array_elements(v_workflow.stages) loop
    insert into public.project_milestones
      (organization_id,project_id,title,description,sequence_no,status)
    values(target_org_id,v_project_id,v_stage->>'name',
      'Workflow stage '||(v_stage->>'key')||'. Completion requires the evidence defined by the template.',
      v_sequence,'planned');
    v_sequence:=v_sequence+1;
  end loop;

  insert into public.project_agents(project_id,agent_id,organization_id,assignment_role,status,authority_scope)
  select v_project_id,a.id,target_org_id,at.role,'planned',
    jsonb_build_object('template_key',at.template_key,'external_actions_allowed',false)
  from public.agents a join public.agent_templates at on at.id=a.agent_template_id
  where a.organization_id=target_org_id and a.agent_status<>'archived'
    and at.template_key in (
      select unnest(agent_template_refs) from public.company_templates
      where template_key='ready_software_company_v1' and version='1.0'
    )
  on conflict(project_id,agent_id) do nothing;

  select a.id into v_product_manager_id
  from public.agents a join public.agent_templates at on at.id=a.agent_template_id
  where a.organization_id=target_org_id and a.agent_status<>'archived' and at.template_key='software_product_manager'
  limit 1;
  insert into public.action_items
    (organization_id,project_id,title,description,status,priority,assigned_agent_id)
  values(target_org_id,v_project_id,'Capture the founder/customer product brief.',
    'Record the supplied mission, target customer, problem, desired outcome, constraints, evidence and open questions. Do not invent missing requirements.',
    'open',1,v_product_manager_id);

  insert into public.audit_events
    (organization_id,actor_type,actor_user_id,event_type,object_type,object_id,risk_level,payload)
  values(target_org_id,'user',v_user_id,'software_project_blueprint.started','project',v_project_id::text,'low',
    jsonb_build_object('project_code',v_project_code,'workflow_key',v_workflow.workflow_key,
      'milestone_count',jsonb_array_length(v_workflow.stages),'first_action','Capture the founder/customer product brief.'));
  return v_project_id;
end $$;
revoke all on function public.start_software_project_blueprint_v1(uuid,text) from public,anon;
grant execute on function public.start_software_project_blueprint_v1(uuid,text) to authenticated;

create or replace function public.apply_company_template_integration_profile_v1(
  target_org_id uuid,
  target_integration_id uuid,
  target_template_key text default 'ready_software_company_v1'
)
returns integer
language plpgsql
security definer
set search_path=public
as $$
declare
  v_user_id uuid:=auth.uid();
  v_integration public.organization_integrations%rowtype;
  v_profile public.company_template_integration_profiles%rowtype;
  v_agent_id uuid;
  v_catalog_mode text;
  v_effective_mode text;
  v_count integer:=0;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  if not public.is_org_owner(target_org_id) then raise exception 'Organization owner authority required'; end if;
  if not exists(select 1 from public.organization_template_installations where organization_id=target_org_id and template_key=trim(target_template_key)) then
    raise exception 'Company template is not installed';
  end if;
  select * into v_integration from public.organization_integrations
  where id=target_integration_id and organization_id=target_org_id and status='connected';
  if v_integration.id is null then raise exception 'A connected organization integration is required'; end if;

  for v_profile in select * from public.company_template_integration_profiles
    where company_template_key=trim(target_template_key) and provider_key=v_integration.provider_key
  loop
    select a.id into v_agent_id
    from public.agents a join public.agent_templates at on at.id=a.agent_template_id
    where a.organization_id=target_org_id and a.agent_status<>'archived' and at.template_key=v_profile.agent_template_key
    limit 1;
    if v_agent_id is null then continue; end if;
    select default_approval_mode into v_catalog_mode from public.integration_capabilities
    where provider_key=v_integration.provider_key and capability_key=v_profile.capability_key;
    if v_catalog_mode is null then raise exception 'Integration capability catalog entry is missing'; end if;
    v_effective_mode:=case
      when v_catalog_mode='human_only' then 'human_only'
      when v_catalog_mode='approval_required' or v_profile.approval_mode='approval_required' then 'approval_required'
      else 'autonomous' end;
    -- Human-only capabilities are intentionally not delegated, even as disabled grants.
    if v_effective_mode='human_only' then continue; end if;
    insert into public.agent_integration_grants
      (organization_id,agent_id,integration_id,capability_key,approval_mode,scope,enabled,granted_by_user_id)
    values(target_org_id,v_agent_id,v_integration.id,v_profile.capability_key,v_effective_mode,v_profile.scope,true,v_user_id)
    on conflict(agent_id,integration_id,capability_key) do update set
      approval_mode=excluded.approval_mode,scope=excluded.scope,enabled=true,granted_by_user_id=excluded.granted_by_user_id;
    v_count:=v_count+1;
  end loop;
  update public.organization_setup_dependencies set status='connected',resolved_at=now(),updated_at=now()
  where organization_id=target_org_id and template_key=trim(target_template_key)
    and dependency_type='integration' and dependency_key=v_integration.provider_key;
  insert into public.audit_events
    (organization_id,actor_type,actor_user_id,event_type,object_type,object_id,risk_level,payload)
  values(target_org_id,'user',v_user_id,'integration_profile.applied','organization_integration',v_integration.id::text,'medium',
    jsonb_build_object('template_key',trim(target_template_key),'provider_key',v_integration.provider_key,
      'grant_count',v_count,'credentials_copied',false,'restricted_capabilities_delegated',false));
  return v_count;
end $$;
revoke all on function public.apply_company_template_integration_profile_v1(uuid,uuid,text) from public,anon;
grant execute on function public.apply_company_template_integration_profile_v1(uuid,uuid,text) to authenticated;

commit;
