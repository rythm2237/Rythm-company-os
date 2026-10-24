import assert from "node:assert/strict";
import Module, { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { transformSync } from "esbuild";

// Exercise the actual private server action without exposing an additional application API.
const sourcePath = resolve("app/(app)/projects/page.tsx");
let created = false;
let context: Record<string, unknown> | null = null;
let createCount = 0;
let assignmentCount = 0;
let auditCount = 0;
let assignmentFails = true;
let resourcesFail = false;
const organizationId = "22222222-2222-4222-8222-222222222222";
const userId = "11111111-1111-4111-8111-111111111111";
const projectId = "33333333-3333-4333-8333-333333333333";
const client = {
  from(table: string) {
    let operation = "read";
    let values: unknown;
    const filters: Record<string, unknown> = {};
    const result = () => {
      if (operation === "read") {
        if (table === "organization_members") return { data: { user_id: userId }, error: null };
        if (table === "projects") return { data: created ? { id: projectId } : null, error: null };
        if (table === "project_context_documents") return { data: context ? { evidence: context } : null, error: null };
        return { data: null, error: null };
      }
      if (table === "project_resources") return { data: null, error: resourcesFail ? { code: "SIMULATED_FAILURE" } : null };
      if (table === "project_context_documents") context = (values as { evidence: Record<string, unknown> }).evidence;
      if (table === "audit_events") auditCount++;
      return { data: null, error: null };
    };
    const chain = {
      select() { return chain; }, eq(key: string, value: unknown) { filters[key] = value; return chain; },
      maybeSingle: async () => result(),
      insert(value: unknown) { operation = "write"; values = value; return chain; },
      upsert(value: unknown) { operation = "write"; values = value; return chain; },
      then(onFulfilled: (value: unknown) => unknown) { return Promise.resolve(result()).then(onFulfilled); },
    };
    return chain;
  },
  async rpc(name: string, input: { p_organization_id: string; p_project: Record<string, unknown> }) {
    assert.equal(name, "crm_create_linked_project");
    assert.equal(input.p_organization_id, organizationId);
    assert.equal(input.p_project.primary_manager_user_id, userId);
    assert.equal(input.p_project.project_type, "website_audit", "Server owns capability/category classification");
    createCount++; created = true; return { data: projectId, error: null };
  },
};
const loader = Module as unknown as { _load: (id: string, ...args: unknown[]) => unknown };
const original = loader._load;
loader._load = function (id, ...args) {
  if (id === "next/cache") return { revalidatePath: () => undefined };
  if (id === "next/navigation") return { redirect: (url: string) => { throw new Error(`REDIRECT:${url}`); } };
  if (id === "@/lib/auth/organization-context") return { requireOrganizationContext: async () => ({ supabase: client, organizationId, user: { id: userId } }) };
  if (id === "@/lib/crm/access") return { requireCrm: async () => undefined, canCrm: async () => true };
  if (id === "@/lib/supabase/server") return { createServerSupabaseClient: () => client };
  if (id === "@/lib/projects/project-agent-assignment") return { assignProjectLead: async () => { assignmentCount++; if (assignmentFails) throw new Error("evidence unavailable"); return { status: "assigned", agentId: "lead", reason: "Eligible lead reserved" }; } };
  if (id === "@/lib/projects/project-intake") return createRequire(import.meta.url)("../lib/projects/project-intake.ts");
  if (id.startsWith("@/")) return {};
  return original.call(this, id, ...args);
};
async function main() {
  const code = transformSync(`${readFileSync(sourcePath, "utf8")}\nexport { createProject as testAction };`, { loader: "tsx", format: "cjs", target: "es2020", jsx: "automatic" }).code;
  const compiled = new Module(sourcePath, module) as Module & { _compile: (code: string, filename: string) => void; exports: { testAction: (form: FormData) => Promise<void> } };
  compiled.filename = sourcePath;
  compiled.paths = (module as NodeJS.Module).paths;
  compiled._compile(code, sourcePath);
  const form = new FormData();
  for (const [key, value] of Object.entries({ guidedSetup: "1", setupRequestId: "44444444-4444-4444-8444-444444444444", name: "Website audit", objective: "Review our website", description: "Review our website", primaryManager: userId, engagementType: "internal", website: "https://example.com", assignmentMode: "auto", projectType: "attacker_chosen_category" })) form.set(key, value);
  const action = compiled.exports.testAction;
  await assert.rejects(() => action(form), /REDIRECT:.*setupWarning=1/);
  assert.equal(createCount, 1);
  assert.equal(context?.setup_complete, false);
  assert.equal(context?.assignment_status, "blocked");
  assignmentFails = false; resourcesFail = true;
  await assert.rejects(() => action(form), /REDIRECT:.*setupWarning=1/);
  assert.equal(createCount, 1, "Retry reuses project created before a post-create failure");
  assert.equal(context?.setup_complete, false, "Resource failure prevents false setup completion");
  resourcesFail = false;
  await assert.rejects(() => action(form), error => error instanceof Error && error.message === `REDIRECT:/projects/operating?project=${projectId}`);
  assert.equal(context?.setup_complete, true);
  assert.equal(context?.assignment_status, "assigned");
  assert.equal(auditCount, 1, "Retry does not duplicate project-created audit events");
  const priorAssignments = assignmentCount;
  await assert.rejects(() => action(form), /REDIRECT:/);
  assert.equal(assignmentCount, priorAssignments, "Completed setup retry does not reserve another AI lead");
  assert.equal(createCount, 1);
  console.log("Project setup action: original CRM transaction, authoritative server classification, caught assignment failure, safe partial setup retry, resource failure state, no duplicate creation/audit/assignment passed.");
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => { loader._load = original; });
