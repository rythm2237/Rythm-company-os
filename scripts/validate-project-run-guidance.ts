import assert from "node:assert/strict";
import Module from "node:module";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { transformSync } from "esbuild";
import { deriveProjectNextAction, type NextActionInput } from "../lib/projects/project-next-action";

// Actual route orchestration; authentication/database/provider boundaries are isolated synthetic fixtures.
const organizationId = "org"; const projectId = "project";
let scenario: NextActionInput;
let approved = false; let active: Record<string, unknown> | null = null;
let creates = 0; let starts = 0; let unauthorized = false;
const client = { from(table: string) {
  const chain: Record<string, unknown> = {};
  for (const method of ["select", "in", "order", "limit"]) chain[method] = () => chain;
  chain.eq = (key: string, value: unknown) => { if (key === "organization_id") assert.equal(value, organizationId); return chain; };
  chain.maybeSingle = async () => ({ data: table === "projects" ? { id: projectId } : table === "project_executions" ? active : null, error: null });
  chain.insert = () => Promise.resolve({ error: null });
  return chain;
} };
const baseline = { id: "baseline", version: 1, status: "approved", isBaseline: true };
const draft = { id: "draft", version: 2, status: "in_review", isBaseline: false };
const loader = Module as unknown as { _load: (id: string, ...args: unknown[]) => unknown };
const original = loader._load;
loader._load = function (id, ...args) {
  if (id === "@/lib/auth/api-organization-context") return { resolveOwnerApiOrganizationContext: async () => unauthorized ? { ok: false, error: "Unauthorized", status: 401 } : { ok: true, supabase: client, organizationId, user: { id: "user" } } };
  if (id === "@/lib/supabase/server") return { createServerSupabaseClient: () => client };
  if (id === "@/lib/projects/project-next-action") return { loadProjectNextAction: async () => deriveProjectNextAction(scenario) };
  if (id === "@/lib/projects/project-roadmap") return { getApprovedProjectRoadmap: async () => approved ? baseline : null, getLatestProjectRoadmap: async () => scenario.roadmap?.status === "in_review" ? draft : null, createProjectRoadmapDraft: async () => { creates++; return draft; } };
  if (id === "@/lib/projects/project-execution-start") return { startProjectExecutionWithoutGlobalGate: async () => { starts++; return { id: "new-execution", execution_no: 2, status: "running" }; } };
  return original.call(this, id, ...args);
};
async function main() {
  const path = resolve("app/api/projects/run/route.ts");
  const compiled = new Module(path, module) as Module & { _compile: (code: string, filename: string) => void; exports: { POST: (request: Request) => Promise<Response> } };
  compiled.filename = path; compiled.paths = module.paths;
  compiled._compile(transformSync(readFileSync(path, "utf8"), { loader: "ts", format: "cjs", target: "es2020" }).code, path);
  async function run(overrides: Partial<NextActionInput>, existing: Record<string, unknown> | null = null) {
    scenario = { projectId, projectStatus: "active", hasAnalysis: true, requiredQuestions: 0, pendingApprovals: 0, roadmap: null, canManage: true, ...overrides };
    approved = Boolean(scenario.roadmap?.isBaseline); active = existing; creates = 0; starts = 0;
    return compiled.exports.POST(new Request("https://example.test/api/projects/run", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ projectId }) }));
  }
  let response = await run({ hasAnalysis: false, executionState: "running" }, { id: "legacy", execution_no: 1, status: "running", roadmap_id: null });
  assert.equal(response.status, 200); assert.equal((await response.json()).mode, "roadmap_review"); assert.equal(creates, 1); assert.equal(starts, 0, "Explicit baseline preparation preserves active legacy run");
  response = await run({ executionState: "running", roadmap: baseline }, { id: "existing", execution_no: 1, status: "running", roadmap_id: "baseline" });
  assert.equal((await response.json()).execution.id, "existing"); assert.equal(creates, 0); assert.equal(starts, 0);
  response = await run({ executionState: "paused", roadmap: draft }, { id: "legacy", status: "paused", roadmap_id: null });
  assert.equal(response.status, 200); assert.equal((await response.json()).mode, "roadmap_review"); assert.equal(starts, 0, "Legacy planning pause can still review a baseline");
  response = await run({ projectStatus: "on_hold", executionState: "paused", roadmap: draft });
  assert.equal(response.status, 409); assert.equal(creates + starts, 0, "Human project hold prevents starting or planning through Run");
  response = await run({ executionState: "failed", roadmap: baseline });
  assert.equal(response.status, 200); assert.equal(starts, 1, "Explicit recovery Run may restart an approved failed execution");
  response = await run({ executionState: "completed", roadmap: baseline });
  assert.equal(response.status, 409); assert.equal(starts, 0, "Completion goes to outcome validation rather than accidental rerun");
  response = await run({ hasAnalysis: false }); assert.equal(response.status, 409); assert.equal(creates, 0);
  unauthorized = true; response = await run({}); assert.equal(response.status, 401); assert.equal(creates + starts, 0);
  console.log("Actual project Run route passed: owner auth, scoped lookup, active legacy baseline preparation, no duplicate active run, planning pause review, human hold, explicit failure recovery, outcome validation and required analysis (isolated boundaries).");
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => { loader._load = original; });
