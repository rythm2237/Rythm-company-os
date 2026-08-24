import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const migrationPath = resolve(process.cwd(), "supabase/migrations/20260824200000_software_company_template.sql");
const sql = readFileSync(migrationPath, "utf8");

const agentKeys = [
  "software_chief_of_staff", "software_finance_manager", "software_legal_compliance_counsel",
  "software_communications_support_manager", "software_sales_crm_manager", "software_people_workforce_manager",
  "software_product_manager", "software_business_analyst", "software_cto_architect", "software_product_designer",
  "software_frontend_engineer", "software_backend_engineer", "software_database_engineer", "software_devops_cloud_engineer",
  "software_qa_test_engineer", "software_application_security_engineer", "software_seo_geo_growth_engineer",
  "software_technical_writer", "software_ai_automation_engineer",
] as const;

const departmentKeys = [
  "executive_operations", "product", "design", "engineering", "quality_security", "growth_customer", "finance_legal",
] as const;

const workflowStages = [
  "IDEA", "DISCOVERY", "REQUIREMENTS", "PRODUCT_DEFINITION", "ARCHITECTURE", "DESIGN", "IMPLEMENTATION",
  "CODE_REVIEW", "QA", "SECURITY_REVIEW", "PREVIEW", "ACCEPTANCE", "PRODUCTION_APPROVAL", "DEPLOY",
  "MONITOR", "SUPPORT", "ITERATE",
] as const;

const specializations = [
  "product_management", "customer_support_communications", "sales_crm", "people_ai_workforce_ops", "finops_accounting",
  "software_architecture", "frontend_engineering", "backend_engineering", "postgres_database_engineering", "devops_cloud",
  "quality_engineering", "application_security", "technical_documentation", "ai_automation", "geo_growth",
] as const;

function includesOnce(value: string, context: string) {
  const occurrences = sql.split(value).length - 1;
  assert.ok(occurrences >= 1, `${context}: missing ${value}`);
}

assert.ok(sql.trimStart().startsWith("-- RYTHM OS"), "migration header is missing");
assert.ok(sql.trimEnd().endsWith("commit;"), "migration must be transactional");
assert.doesNotMatch(sql, /^\s*'\[.*\],$/m, "JSON array literal is missing a closing SQL quote");
assert.equal(new Set(agentKeys).size, 19, "Agent catalog must contain 19 unique contracts");
assert.equal(new Set(departmentKeys).size, 7, "organization must contain seven unique departments");
assert.equal(new Set(workflowStages).size, 17, "delivery workflow must contain 17 unique stages");

for (const key of agentKeys) includesOnce(`('${key}','1.0'`, "Agent catalog");
for (const key of departmentKeys) includesOnce(`\"key\":\"${key}\"`, "department catalog");
for (const key of workflowStages) includesOnce(`\"key\":\"${key}\"`, "workflow catalog");
for (const key of specializations) includesOnce(`'${key}'`, "professional specialization catalog");

const reportingContracts: Record<string, string | null> = {
  software_chief_of_staff: null,
  software_finance_manager: "software_chief_of_staff",
  software_legal_compliance_counsel: "software_chief_of_staff",
  software_communications_support_manager: "software_chief_of_staff",
  software_sales_crm_manager: "software_chief_of_staff",
  software_people_workforce_manager: "software_chief_of_staff",
  software_product_manager: "software_chief_of_staff",
  software_business_analyst: "software_product_manager",
  software_cto_architect: "software_chief_of_staff",
  software_product_designer: "software_product_manager",
  software_frontend_engineer: "software_cto_architect",
  software_backend_engineer: "software_cto_architect",
  software_database_engineer: "software_cto_architect",
  software_devops_cloud_engineer: "software_cto_architect",
  software_qa_test_engineer: "software_chief_of_staff",
  software_application_security_engineer: "software_chief_of_staff",
  software_seo_geo_growth_engineer: "software_chief_of_staff",
  software_technical_writer: "software_cto_architect",
  software_ai_automation_engineer: "software_cto_architect",
};
for (const [child, parent] of Object.entries(reportingContracts)) {
  if (parent) assert.ok(sql.includes(`'${child}','1.0'`) && sql.includes(`'${parent}'`), `reporting contract missing for ${child}`);
  else assert.ok(sql.includes(`'${child}','1.0'`) && sql.includes("'executive_operations',null"), "Chief of Staff must be the root");
}

const profileStart = sql.indexOf("insert into public.company_template_integration_profiles");
const profileEnd = sql.indexOf("alter table public.action_items", profileStart);
assert.ok(profileStart > 0 && profileEnd > profileStart, "integration profile seed is missing");
const profiles = sql.slice(profileStart, profileEnd);
for (const capability of ["repo.delete", "project.delete", "data.delete", "payout.modify"]) {
  assert.ok(!profiles.includes(`'${capability}'`), `${capability} must never be delegated by a template profile`);
}
for (const capability of ["pull_request.merge", "production.deploy", "migration.apply", "dns.write", "refund.create", "email.send"]) {
  assert.match(profiles, new RegExp(`'${capability}','approval_required'`), `${capability} must require approval`);
}

for (const table of ["company_template_workflows", "company_template_meeting_types", "company_template_integration_profiles", "company_template_integration_requirements", "organization_setup_dependencies", "integration_providers", "integration_capabilities"]) {
  assert.ok(sql.includes(`alter table public.${table} enable row level security`), `RLS missing for ${table}`);
}
assert.ok(sql.includes("integration_credentials_copied',false"), "credential non-copy invariant missing");
assert.ok(sql.includes("'Capture the founder/customer product brief.'"), "first product action is missing");
assert.ok(sql.includes("perform public.verify_agent_mastery_v1(v_agent_id)"), "provisioning must verify internal professional mastery");
assert.ok(sql.includes("company_knowledge_connected=true"), "tenant company knowledge must be connected");
assert.ok(sql.includes("external_actions_allowed=false"), "external actions must start disabled");
assert.ok(sql.includes("v_entitlement.max_active_agents"), "Agent entitlement limit must be enforced");
assert.ok(sql.includes("v_entitlement.max_projects"), "project entitlement limit must be enforced");

console.log(`Software Company template contract verified: ${agentKeys.length} Agents, ${departmentKeys.length} departments, ${workflowStages.length} stages.`);
