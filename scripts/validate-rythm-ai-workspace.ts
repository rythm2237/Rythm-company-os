import fs from "node:fs";

const required = [
  "app/(app)/ai/page.tsx","components/ai-workspace/AIWorkspaceClient.tsx","app/api/ai-workspace/chat/route.ts","app/api/ai-workspace/session/route.ts","lib/ai-workspace/service.ts","supabase/migrations/20260920213000_rythm_ai_workspace_foundation.sql","supabase/migrations/20260920213100_rythm_ai_workspace_provider_state_hardening.sql","supabase/migrations/20260920213200_rythm_ai_workspace_idempotency_currency.sql"
];
for (const file of required) if (!fs.existsSync(file)) throw new Error(`Missing AI Workspace file: ${file}`);
const migration = required.filter(file=>file.endsWith(".sql")).map(file=>fs.readFileSync(file,"utf8")).join("\n");
for (const token of ["usage_ledger_immutable","aiw_reserve_usage","aiw_settle_usage","aiw_mark_uncertain","enable row level security","revoke all","ai_usage_client_stage_unique","ai_usage_answer_inflight","internal_result","'USD'"]) if (!migration.includes(token)) throw new Error(`Missing financial/security invariant: ${token}`);
const chat = fs.readFileSync("app/api/ai-workspace/chat/route.ts","utf8");
for (const token of ["executeAiRequest","prompt_enhancement","aiw_mark_uncertain","USAGE_RECONCILIATION_REQUIRED","telemetryPolicy: \"required\"","requestKey","REQUEST_RECONCILIATION_PENDING","p_internal_result"]) if (!chat.includes(token)) throw new Error(`Missing chat invariant: ${token}`);
const client = fs.readFileSync("components/ai-workspace/AIWorkspaceClient.tsx","utf8");
for (const token of ["Knowledge","Memory","Files","Saved Prompts","Plugins","Skills","Plan & Billing","Professional","Admin setup required","crypto.randomUUID"]) if (!client.includes(token)) throw new Error(`Missing UI contract: ${token}`);
console.log("RYTHM AI Workspace foundation validation passed");
