import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync("supabase/migrations/20260828090000_ready_ai_company_library.sql", "utf8");
const standardMigration = readFileSync("supabase/migrations/20260828101500_ready_company_minimum_standard.sql", "utf8");
const enforcementMigration = readFileSync("supabase/migrations/20260828102500_ready_company_standard_enforcement.sql", "utf8");
const advertisingFoundationMigration = readFileSync("supabase/migrations/20260828145500_advertising_professional_foundations.sql", "utf8");
const gtmMigration = readFileSync("supabase/migrations/20260828152000_senior_gtm_strategist.sql", "utf8");
const standardDoc = readFileSync("docs/phase4-ready-company-minimum-standard.md", "utf8");
const page = readFileSync("app/(app)/studio/templates/page.tsx", "utf8");
const actions = readFileSync("app/(app)/studio/templates/actions.ts", "utf8");
const launchPage = readFileSync("app/(app)/company/launch/page.tsx", "utf8");
const activeGuide = readFileSync("components/onboarding/ActiveWorkspaceGuide.tsx", "utf8");
const integrationGuide = readFileSync("app/(app)/integrations/integration-setup-guide.tsx", "utf8");
const agentKnowledge = readFileSync("app/(app)/agents/[code]/knowledge/page.tsx", "utf8");
const agentUploader = readFileSync("app/(app)/agents/[code]/AgentKnowledgeUploader.tsx", "utf8");
const companyKnowledgeRuntime = readFileSync("lib/company-knowledge.ts", "utf8");

const mustContain = (source: string, values: string[]) => values.forEach((value) => assert.ok(source.includes(value), `Missing Phase 4 contract: ${value}`));

mustContain(migration, ["ready_saas_startup_v1","array['ready_company','custom_company','company_studio']",'"agent_count":10',"agents_initial_status","external_actions_allowed","template_snapshot","template_snapshot_digest","extensions.digest","Installed company template snapshots are immutable","human_ceo_authority","high_risk_requires_approval","production_release_requires_approval","tenant_isolation_required","saas_startup_delivery_v1","company_template_integration_profiles","company_template_integration_requirements"]);
assert.ok(!migration.includes("grant execute on function public.capture_company_template_installation_snapshot_v1"));
assert.ok(migration.includes("revoke insert,update,delete,truncate on public.company_templates from anon,authenticated"));

mustContain(standardDoc,["Mandatory company functions","Generic Business Connector fallback","Advertising Agency extension","Finance / Accounting","Legal / Compliance","People / Workforce","budget/spend","Meta Marketing","Google Ads","YouTube","TikTok for Business","LinkedIn Marketing"]);
mustContain(standardMigration,["minimum_standard_version","function_coverage","integration_family_coverage","generic_connector_fallback","generic_business_api","accounting_erp","crm_sales","website_cms","legal_contracts","people_hris","meta_marketing","google_ads","youtube","tiktok_business","linkedin_marketing","advertising_finance_accounting_manager","advertising_legal_compliance_counsel","advertising_operations_people_manager","'budget.modify','restricted','human_only'","provider_adapters_must_be_verified_before_execution","maturity='preview'","ready_company_minimum_standard_status"]);
mustContain(enforcementMigration,["company_templates_stable_minimum_standard_check","company_templates_advertising_extension_check","finance_accounting","legal_compliance","people_workforce","generic_business_api","meta_marketing","google_ads","youtube","tiktok_business","linkedin_marketing","spend_requires_human_ceo"]);
for(const provider of ["generic_business_api","meta_marketing","google_ads","youtube","tiktok_business","linkedin_marketing"]) assert.ok(standardMigration.includes(`('${provider}'`)||standardMigration.includes(`  ('${provider}'`));
assert.ok(standardMigration.includes("false,'1.0.0'"));
assert.ok(!standardMigration.includes("'budget.modify','autonomous'"));
assert.ok(!standardMigration.includes("'budget.modify','approval_required'"));

mustContain(advertisingFoundationMigration,["advertising_account_manager","advertising_analytics_specialist","advertising_content_specialist","advertising_copywriter","advertising_creative_director","advertising_performance_marketing","advertising_strategy_director","advertising_finance_accounting_manager","advertising_legal_compliance_counsel","advertising_operations_people_manager","role_family = 'marketing'","role_family = 'analytics'","role_family = 'design'","role_family = 'legal'","role_family = 'general'","role_foundations","role_specializations","Advertising Agency professional knowledge contract is incomplete"]);
assert.ok(!advertisingFoundationMigration.includes("role_family = null"));

mustContain(gtmMigration,["'gtm-strategist','1.0','GTM Strategist','Senior GTM Strategist'","Go-to-Market Strategy","TAM, SAM and SOM","ICP","30/60/90","ROAS","Respond in the user's language","Adaptive Routing","AI Gateway","Explicit Human approval is required","role_family='marketing'","array['b2b_marketing','performance_marketing']","go_to_market_strategy","Strategy & Growth","'gtm-strategist'=any(agent_template_refs)","'{agent_count}','11'","strategy_input_only","Senior GTM Strategist must not be auto-added to unrelated Ready Companies"]);
assert.ok(!gtmMigration.includes("runtime_model='"));
assert.ok(!gtmMigration.includes("budget.modify','autonomous"));
assert.equal((gtmMigration.match(/insert into public\.agent_templates/g)??[]).length,1);

mustContain(page,["RYTHM READY COMPANY MARKETPLACE","Immutable catalog releases","template_snapshot_digest","provisionCompanyTemplate","Version snapshot isolation","const hasCapacity"]);
assert.ok(page.includes("supported_product_codes.includes"));
assert.ok(page.includes("context.entitlement.max_active_agents")&&page.includes("template.agent_template_refs.length"));
assert.ok(page.includes('template.template_key === "ready_software_company_v1"'));

mustContain(actions,['rpc("provision_company_template_v2"',"/company/launch","Complete%20the%20launch%20checklist"]);
mustContain(launchPage,["COMPANY READINESS","Company profile","Company knowledge","Legal foundation","Business integrations","Agent workforce","First project","First company meeting","Enter Company"]);
mustContain(activeGuide,["Guide me","Do this now","Next:","rythm-active-guide","/company/launch","/integrations","/agents","/projects","/meetings","/command-center"]);
mustContain(integrationGuide,["Guide this connection","Show me where","Security checkpoint","background:\"rgba(255,255,255,.985)\"","google_ads","meta_marketing","youtube","tiktok_business","linkedin_marketing"]);
mustContain(agentKnowledge,["AGENT KNOWLEDGE","Add role-specific knowledge without writing a prompt","directAcl=`agent:${agent.id}`","AgentKnowledgeUploader"]);
mustContain(agentUploader,["registerCompanyLibraryDocument","allowedRoleKeywords:[`agent:${agentId}`]","Add knowledge to this Agent","No prompt is required","<option value=\"marketing\">Marketing</option>","<option value=\"technical\">Technical</option>"]);
mustContain(companyKnowledgeRuntime,["const exactAgentAcl=`agent:${agent.id}`","agentScoped","normalize(value)===exactAgentAcl","allowedKnowledgeIds","filter((item)=>allowedKnowledgeIds.has(item.knowledge_id))"]);

console.log("Phase 4 Ready AI Company Library + launch experience + guided setup + exact Agent knowledge contract validation passed.");
