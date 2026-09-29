import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const sql = readFileSync("supabase/migrations/20260929070810_paid_launch_privileged_function_hardening.sql", "utf8").toLowerCase();
const invoice = "public.aiw_apply_paid_plan_invoice";
assert.match(sql, /revoke all on function public\.aiw_apply_paid_plan_invoice\([\s\S]*?\) from public, anon, authenticated;/);
assert.match(sql, /grant execute on function public\.aiw_apply_paid_plan_invoice\([\s\S]*?\) to service_role;/);
for (const name of [
  "aiw_apply_paid_plan_payment_trigger", "aiw_apply_starter_payment_trigger",
  "aiw_sync_paid_plan_subscription_trigger", "aiw_sync_starter_subscription_trigger",
  "generate_communication_daily_digest", "nail_2nya_emit_realtime_event",
]) {
  assert.ok(sql.includes(`revoke all on function public.${name}() from public, anon, authenticated;`), name);
}
assert.match(sql, /revoke insert, update, delete, truncate, references, trigger[\s\S]*?on public\.billing_payments, public\.billing_subscriptions[\s\S]*?from public, anon, authenticated;/);

const source = readFileSync("supabase/migrations/202609211345_ai_workspace_plan_tiers_regional_pricing.sql", "utf8").toLowerCase();
assert.ok(source.includes(`select ${invoice}(`), "paid-plan trigger still calls invoice grant");
const webhook = readFileSync("app/api/billing/webhook/route.ts", "utf8");
assert.match(webhook, /verify\(body,signature,secret\)/);
assert.match(webhook, /createBillingAdminClient\(\)/);
console.log("Paid-launch privilege and webhook boundary validation passed.");
