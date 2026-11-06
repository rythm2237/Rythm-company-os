import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Offline contract checks only. Passing does NOT replace live staging negative
// caller/tenant tests or the Supabase Security Advisor rerun.
const sql = readFileSync("supabase/migrations/20261106150000_w04_rpc_security_definer_hardening.sql", "utf8");
const probe = readFileSync("scripts/w04-staging-catalog-assertions.sql", "utf8");

assert.match(sql, /alter function public\.project_approval_decision_group_v1\(text, text\)\s+set search_path = pg_catalog, pg_temp;/i);
assert.match(sql, /alter function public\.project_approval_is_delegatable_v1\(\s*text, text, text, text, jsonb, text, text, text\s*\) set search_path = pg_catalog, pg_temp;/i);
assert.match(sql, /revoke execute on function public\.provision_default_integration_department_on_entitlement_v1\(\)\s+from public, anon, authenticated;/i);
assert.match(sql, /grant execute on function public\.provision_default_integration_department_on_entitlement_v1\(\)\s+to service_role;/i);
assert.doesNotMatch(sql, /(?:revoke|alter function)\s+[^;]*nail_2nya_(?:available|cancel|create_booking|create_contact|get_booking|subscribe_customer_push)/i);
assert.match(probe, /has_function_privilege\('anon'/i);
assert.match(probe, /has_function_privilege\('authenticated'/i);
assert.match(probe, /proconfig/i);

assert.match(sql, /create or replace function public\\.consume_api_rate_limit\\(/i);
assert.match(sql, /request_count = case\\s+when public\\.api_rate_limits\\.request_count >= 2147483647 then 2147483647\\s+else public\\.api_rate_limits\\.request_count \\+ 1\\s+end,/i);
assert.doesNotMatch(sql, /request_count = least\\(public\\.api_rate_limits\\.request_count \\+ 1, p_limit \\+ 1\\)/i);
const negative = readFileSync("scripts/w04-staging-negative-rpc.sql", "utf8");
assert.match(negative, /set local role authenticated;/i);
assert.match(negative, /if v_count <> 101/i);
assert.match(negative, /rollback;/i);

console.log("W04 offline migration contract PASS (staging/runtime unverified).");
