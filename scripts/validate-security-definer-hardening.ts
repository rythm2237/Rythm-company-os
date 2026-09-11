import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const hardening = readFileSync("supabase/migrations/20260911195800_revoke_project_dependency_rpc_public_execute.sql", "utf8").toLowerCase();

for (const signature of [
  "public.refresh_project_action_dependencies(uuid)",
  "public.trg_refresh_project_action_dependencies()",
]) {
  assert.match(hardening, new RegExp(`revoke execute on function ${signature.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} from public`));
  assert.match(hardening, new RegExp(`revoke execute on function ${signature.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} from anon`));
  assert.match(hardening, new RegExp(`revoke execute on function ${signature.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} from authenticated`));
  assert.match(hardening, new RegExp(`grant execute on function ${signature.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} to service_role`));
}

const audit = readFileSync("docs/security/security-definer-authenticated-audit-2026-09-11.md", "utf8").toLowerCase();
assert.match(audit, /39 authenticated-callable security definer functions/);
assert.match(audit, /no cross-tenant unauthenticated bypass was identified/);
assert.match(audit, /no security definer function may be executable by `public` or `anon`/);

console.log("SECURITY DEFINER hardening validation passed.");
