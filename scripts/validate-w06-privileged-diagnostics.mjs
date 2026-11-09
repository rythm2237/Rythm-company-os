import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Contract test: privileges can expose SQL/provider/customer contents through
// logs, error ledgers and UI. These modules must store only stable diagnostics.
const modulePaths=[
  "lib/admin/automation/executor.ts",
  "lib/agency-level-progression.ts",
  "lib/agency-specialist-assessment.ts",
  "lib/agent-professional-assessment.ts",
  "lib/company-bootstrap/discovery.ts",
  "lib/company-knowledge.ts",
  "lib/evaluation/runtime.ts",
  "lib/evaluation/promotion.ts",
  "lib/projects/project-tool-execution.ts",
  "lib/projects/project-proposal-execution.ts",
  "lib/integrations/service-runner.ts",
  "lib/integrations/connections/agent-oauth-callback.ts",
  "lib/integrations/connections/customer-platform-oauth.ts",
];
for(const path of modulePaths){
  const source=readFileSync(path,"utf8");
  assert.doesNotMatch(source, /\$\{(?:\w+\.)*(?:\w*[eE]rror)\.message\}/,
    path+" must not interpolate raw SQL/provider errors");
  assert.doesNotMatch(source, /\berror\s+instanceof\s+Error\s*\?\s*error\.message/,
    path+" must not persist or reflect raw exception messages");
  assert.doesNotMatch(source, /\bredactSecretText\s*\(\s*(?:error|[\w]+Error)/,
    path+" generic secret redaction is not enough to protect arbitrary customer text");
}
const chat=readFileSync("app/api/ai-workspace/chat/route.ts","utf8");
assert.match(chat,/console\.error\("ai_workspace_chat_failed",\s*\{code\}\)/);
assert.doesNotMatch(chat,/console\.error\("ai_workspace_chat_failed",\s*\{code,error\}/);
const agentOAuth=readFileSync("lib/integrations/connections/agent-oauth-callback.ts","utf8");
const ownerGate=agentOAuth.indexOf("const actor = await resolveOrganizationContext()");
const serviceGate=agentOAuth.indexOf("const service = createExecutionServiceClient()");
assert(ownerGate>=0&&serviceGate>ownerGate,"current owner verification must precede privileged OAuth client");
assert.match(agentOAuth,/actor\.user\.id !== payload\.userId/);
assert.match(agentOAuth,/actor\.organizationId !== payload\.organizationId/);
assert.match(agentOAuth,/actor\.role !== "owner"/);
console.log("PASS W06 privileged diagnostic and OAuth owner-order contracts: 13 worker/helper modules plus AI chat handler.");
