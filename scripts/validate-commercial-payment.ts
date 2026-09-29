import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHmac } from "node:crypto";
import { NextRequest } from "next/server";
import Module from "node:module";
import { PGlite } from "@electric-sql/pglite";
import { ONLINE_CHECKOUT_ENABLED, COMMERCIAL_ACTIVATION_MODEL } from "../lib/commercial/activation-policy";

async function main() {
  assert.equal(COMMERCIAL_ACTIVATION_MODEL, "assisted");
  assert.equal(ONLINE_CHECKOUT_ENABLED, false);
  const loader = Module as unknown as { _load: (id: string, ...args: unknown[]) => unknown };
  const original = loader._load;
  loader._load = function(id, ...args) {
    if (id === "server-only") return {};
    return original.call(this, id, ...args);
  };
  for (const route of ["checkout", "portal"]) {
    const endpoint = await import(`../app/api/billing/${route}/route`);
    const response = await endpoint.POST();
    assert.equal(response.status, 409);
    assert.equal((await response.json()).error, "ASSISTED_ACTIVATION_REQUIRED");
  }
  const webhook = await import("../app/api/billing/webhook/route");
  const previousSecret = process.env.STRIPE_WEBHOOK_SECRET;
  try {
    process.env.STRIPE_WEBHOOK_SECRET = "isolated-payment-policy-test-secret";
    const body = JSON.stringify({ id: "evt_isolated_test", type: "invoice.paid", data: { object: {} } });
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = createHmac("sha256", process.env.STRIPE_WEBHOOK_SECRET).update(`${timestamp}.${body}`).digest("hex");
    const response = await webhook.POST(new NextRequest("http://localhost/api/billing/webhook", { method: "POST", body, headers: { "stripe-signature": `t=${timestamp},v1=${signature}` } }));
    assert.equal(response.status, 503);
    assert.match((await response.json()).error, /disabled for assisted activation/);
    const invalid = await webhook.POST(new NextRequest("http://localhost/api/billing/webhook", { method: "POST", body }));
    assert.equal(invalid.status, 400);
  } finally {
    if (previousSecret === undefined) delete process.env.STRIPE_WEBHOOK_SECRET;
    else process.env.STRIPE_WEBHOOK_SECRET = previousSecret;
    loader._load = original;
  }
  const db = new PGlite();
  try {
    // Isolated PostgreSQL fixtures. Existing billing schema/migration is executed
    // verbatim; no test users, payments or organizations are written to Production.
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth;
      create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      create table auth.users(id uuid primary key);
      create table public.platform_admins(user_id uuid primary key, enabled boolean);
      create function public.is_platform_admin() returns boolean language sql security definer set search_path='' as $$ select exists(select 1 from public.platform_admins where user_id=auth.uid() and enabled) $$;
      create table public.organizations(id uuid primary key, status text);
      create table public.organization_members(organization_id uuid,user_id uuid,role text,membership_status text default 'active');
      create table public.organization_entitlements(organization_id uuid primary key references organizations(id),product_code text,plan_code text,status text,base_price numeric(12,2),currency text,billing_interval text,starts_at timestamptz,ends_at timestamptz,renews_at timestamptz,updated_at timestamptz);
      create table public.commercial_offers(offer_code text primary key,self_serve boolean,contact_sales boolean,cta_label text,cta_href text,updated_at timestamptz);
      create table public.aiw_plan_prices(checkout_enabled boolean);
      create table public.agents(id uuid primary key);
      create table public.finance_invoices(id uuid primary key);
      create table public.finance_transactions(id uuid primary key);
      create table public.audit_events(organization_id uuid,actor_type text,actor_user_id uuid,event_type text,object_type text,object_id text,risk_level text,payload jsonb);
    `);
    await db.exec(readFileSync("supabase/migrations/20260822190500_multitenant_billing_payments.sql", "utf8"));
    await db.exec(`grant usage on schema public,auth to anon,authenticated,service_role;
      grant select,insert,update,delete on all tables in schema public to authenticated;
      insert into commercial_offers(offer_code,self_serve) values('ready_ai_company',true),('ai_workspace_starter',true);
      insert into aiw_plan_prices values(true);
      insert into platform_admins values('00000000-0000-4000-8000-000000000001',true);
      insert into organizations values('00000000-0000-4000-8000-000000000010','approved'),('00000000-0000-4000-8000-000000000020','approved');
      insert into organization_members(organization_id,user_id,role) values('00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000002','owner');
      insert into organization_entitlements(organization_id,product_code,status,base_price,currency,billing_interval) values('00000000-0000-4000-8000-000000000010','ready_company','pending',249,'EUR','month'),('00000000-0000-4000-8000-000000000020','company_studio','pending',699,'EUR','month');
      revoke insert,update,delete on billing_payments,billing_subscriptions from authenticated;
    `);
    await db.exec(readFileSync("supabase/migrations/20260929200427_assisted_commercial_activation.sql", "utf8"));
    const scalar = async (sql: string) => (await db.query<{ value: unknown }>(sql)).rows[0].value;
    const org = "00000000-0000-4000-8000-000000000010";
    const call = (reference = "INV-TEST-001", amount = 249, currency = "EUR") =>
      db.query("select platform_confirm_company_payment_v1($1,$2,$3,$4,date_trunc('day',now()),date_trunc('day',now())+interval '1 month') as result", [org, reference, amount, currency]);
    assert.equal(await scalar("select count(*)::int as value from commercial_offers where self_serve"), 0);
    assert.equal(await scalar("select count(*)::int as value from aiw_plan_prices where checkout_enabled"), 0);
    await db.exec("set role anon");
    await assert.rejects(call(), /permission denied/);
    await db.exec("reset role; set role authenticated; set request.jwt.claim.sub='00000000-0000-4000-8000-000000000002'");
    await assert.rejects(call(), /Platform administrator required/);
    await assert.rejects(db.exec("update billing_accounts set provider_customer_id='forged'"), /permission denied/);
    await assert.rejects(db.exec("update billing_checkout_sessions set status='complete'"), /permission denied/);
    await db.exec("reset role; set role service_role; set request.jwt.claim.sub=''");
    await assert.rejects(call(), /permission denied/);
    await db.exec("reset role; set role authenticated; set request.jwt.claim.sub='00000000-0000-4000-8000-000000000001'");
    await assert.rejects(call("INV-UNDER", 248), /recorded subscription price/);
    await assert.rejects(call("INV-CURRENCY", 249, "USD"), /recorded subscription price/);
    await db.exec("reset role; create function reject_audit() returns trigger language plpgsql as $$begin raise exception 'TEST_AUDIT_UNAVAILABLE'; end$$; create trigger reject_audit before insert on audit_events for each row execute function reject_audit(); set role authenticated");
    await assert.rejects(call(), /TEST_AUDIT_UNAVAILABLE/);
    await db.exec("reset role");
    assert.equal(await scalar("select count(*)::int as value from billing_payments"), 0);
    assert.equal(await scalar("select count(*)::int as value from billing_subscriptions"), 0);
    assert.equal(await scalar(`select status as value from organization_entitlements where organization_id='${org}'`), "pending");
    await db.exec("drop trigger reject_audit on audit_events; set role authenticated");
    const first = await call();
    assert.equal((first.rows[0] as { result: { already_recorded: boolean } }).result.already_recorded, false);
    const replay = await call();
    assert.equal((replay.rows[0] as { result: { already_recorded: boolean } }).result.already_recorded, true);
    await assert.rejects(call("INV-TEST-001", 250), /different details/);
    await assert.rejects(call("INV-TEST-002"), /charged twice/);
    await db.exec("reset role");
    assert.equal(await scalar("select count(*)::int as value from billing_payments"), 1);
    assert.equal(await scalar("select count(*)::int as value from audit_events"), 1);
    assert.equal(await scalar(`select count(*)::int as value from organization_entitlements e join billing_subscriptions s using(organization_id) join billing_payments p on p.subscription_id=s.id where e.status='active' and e.ends_at=s.current_period_end and p.status='succeeded'`), 1);
    assert.equal(await scalar("select status as value from organization_entitlements where organization_id='00000000-0000-4000-8000-000000000020'"), "pending");
    await db.exec("set role authenticated; set request.jwt.claim.sub='00000000-0000-4000-8000-000000000003'");
    assert.equal(await scalar("select count(*)::int as value from billing_payments"), 0, "Other tenant must not read payment");
    await db.exec("set request.jwt.claim.sub='00000000-0000-4000-8000-000000000002'");
    assert.equal(await scalar("select count(*)::int as value from billing_payments"), 1, "Owner retains own payment read");
    console.log("PASS assisted-only endpoints; actual PostgreSQL migration; anon/owner/service denial; invoice amount/currency; atomic rollback; idempotency; matching payment/subscription/entitlement; tenant reads.");
  } finally { await db.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
