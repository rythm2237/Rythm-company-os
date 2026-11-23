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
    for (let delivery = 0; delivery < 2; delivery++) {
      const response = await webhook.POST(new NextRequest("http://localhost/api/billing/webhook", { method: "POST", body, headers: { "stripe-signature": `t=${timestamp},v1=${signature}` } }));
      assert.equal(response.status, 503);
      assert.match((await response.json()).error, /disabled for assisted activation/);
    }
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
      create table public.organization_entitlements(organization_id uuid primary key references organizations(id),product_code text,plan_code text,status text,base_price numeric(12,2),currency text,billing_interval text,starts_at timestamptz,ends_at timestamptz,renews_at timestamptz,updated_at timestamptz,max_active_agents integer not null default 12);
      create table public.commercial_offers(offer_code text primary key,self_serve boolean,contact_sales boolean,cta_label text,cta_href text,updated_at timestamptz);
      create table public.aiw_plan_prices(checkout_enabled boolean);
      create table public.agents(id uuid primary key,organization_id uuid,agent_status text);
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
    await db.exec("reset role");
    await db.exec(readFileSync("supabase/migrations/20261123120000_w16_assisted_b2b.sql", "utf8"));
    const otherOrg = "00000000-0000-4000-8000-000000000020";
    const operator = "00000000-0000-4000-8000-000000000001";
    const owner = "00000000-0000-4000-8000-000000000002";
    const member = "00000000-0000-4000-8000-000000000003";
    const inactiveOwner = "00000000-0000-4000-8000-000000000004";
    const tenantAdmin = "00000000-0000-4000-8000-000000000005";
    await db.query(`insert into organization_members values
      ($1,$2,'member','active'),($1,$3,'owner','inactive'),($1,$4,'admin','active'),($5,$2,'owner','active')`,
      [org, member, inactiveOwner, tenantAdmin, otherOrg]);
    const assume = (user: string) => db.exec(`reset role; set role authenticated; set request.jwt.claim.sub='${user}'`);
    const step = async (action: string, reference: string, order: string | null, details: object = {}, organization = otherOrg) =>
      (await db.query<{ id: string | null }>("select platform_assisted_billing_v1($1,$2,$3,$4) as id",
        [organization, action, order, JSON.stringify({ reference, ...details })])).rows[0].id;
    const payment = { amount: 888, currency: "EUR" };
    const reducedPayment = { amount: 789, currency: "EUR" };
    const dates = (startOffset: number, endOffset: number) => {
      const date = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString();
      return { start: date(startOffset), end: date(endOffset), due: date(-1) };
    };
    for (const [role, user] of [["anon", owner], ["service_role", operator]]) {
      await db.exec(`reset role; set role ${role}; set request.jwt.claim.sub='${user}'`);
      await assert.rejects(step("offboard", "EXIT-DENIED", null), /permission denied/);
    }
    for (const user of [member, inactiveOwner, tenantAdmin]) {
      await assume(user);
      assert.equal(await scalar("select count(*)::int as value from billing_payments"), 0);
      await assert.rejects(step("offboard", "EXIT-DENIED", null), /Platform administrator required/);
    }
    await assume(owner);
    assert.equal(await scalar("select count(*)::int as value from billing_payments"), 1);
    await assert.rejects(db.exec("update billing_subscriptions set status='active'"), /permission denied/);
    await assume(operator);
    await assert.rejects(call(), /permission denied/);

    const initial = await step("quote", "QUOTE-001", null, { ...dates(-3, 25), amount: 699 });
    assert.ok(initial);
    await assert.rejects(step("approve", "REVIEW-001", initial, { ...dates(-3, 25), invoice: "W16-INV-001", amount: 189 }), /signed order/);
    await step("sign", "ORDER-001", initial);
    await assert.rejects(step("sign", "WRONG-TENANT", initial, {}, org), /unavailable for this company/);
    await assert.rejects(step("settle", "BANK-001", initial, payment), /reviewed invoice/);
    await step("approve", "REVIEW-001", initial, { due: dates(-3, 25).due, invoice: "W16-INV-001", amount: 189 });
    await assert.rejects(step("settle", "BANK-001", initial, { ...payment, amount: 699 }), /gross amount/);
    await step("late", "OVERDUE-001", initial);
    await db.exec(`reset role; create trigger reject_audit before insert on audit_events for each row
      when (new.event_type='billing.assisted.settle') execute function reject_audit(); set role authenticated`);
    await assert.rejects(step("settle", "BANK-001", initial, payment), /TEST_AUDIT_UNAVAILABLE/);
    await db.exec("reset role");
    assert.equal(await scalar(`select count(*)::int as value from billing_payments where organization_id='${otherOrg}'`), 0);
    assert.equal(await scalar(`select status as value from organization_entitlements where organization_id='${otherOrg}'`), "pending");
    await db.exec("drop trigger reject_audit on audit_events; set role authenticated");
    await Promise.all([step("settle", "BANK-001", initial, payment), step("settle", "BANK-001", initial, payment)]);
    await assert.rejects(step("settle", "BANK-OTHER", initial, payment), /approved unpaid/);
    await db.exec("reset role");
    assert.equal(await scalar(`select count(*)::int as value from billing_payments where organization_id='${otherOrg}'`), 1);
    assert.equal(await scalar(`select count(*)::int as value from audit_events where organization_id='${otherOrg}' and event_type='billing.assisted.settle'`), 1);
    await assume(owner);
    assert.equal(await scalar("select count(*)::int as value from assisted_billing_orders"), 0);
    assert.equal(await scalar("select count(*)::int as value from billing_payments"), 1);
    await assume(member);
    assert.equal(await scalar("select count(*)::int as value from billing_payments"), 1);
    await assume(operator);
    const approvedRenewal = async (suffix: string, start: number, end: number, agentLimit?: number) => {
      const range = dates(start, end);
      const order = await step("quote", `QUOTE-${suffix}`, null, { ...range, amount: agentLimit ? 600 : 699, agentLimit });
      await step("sign", `ORDER-${suffix}`, order);
      await step("approve", `REVIEW-${suffix}`, order, { invoice: `W16-INV-${suffix}`, amount: 189, due: range.due });
      return order;
    };
    const future = await approvedRenewal("FUTURE", 26, 54);
    await assert.rejects(step("settle", "BANK-FUTURE", future, payment), /current monthly service period/);
    const overlap = await approvedRenewal("OVERLAP", -1, 26);
    await assert.rejects(step("settle", "BANK-OVERLAP", overlap, payment), /charged twice/);
    await step("cancel", "CANCEL-001", null);
    await db.exec("reset role");
    assert.equal(await scalar(`select cancel_at_period_end as value from billing_subscriptions where organization_id='${otherOrg}'`), true);
    assert.equal(await scalar(`select (ends_at>now() and status='active') as value from organization_entitlements where organization_id='${otherOrg}'`), true);
    // Advance the isolated recorded period to represent the clock passing the paid end.
    await db.exec(`update billing_subscriptions set current_period_start=now()-interval '1 month',current_period_end=now()-interval '2 days' where organization_id='${otherOrg}';
      update organization_entitlements set starts_at=now()-interval '1 month',ends_at=now()-interval '2 days' where organization_id='${otherOrg}';
      insert into agents select gen_random_uuid(),'${otherOrg}','enabled' from generate_series(1,7)`);
    await assume(operator);
    await assert.rejects(step("settle", "BANK-VOID", future, payment), /approved unpaid/);
    const renewal = await approvedRenewal("002", -1, 26, 6);
    await step("late", "OVERDUE-002", renewal);
    await db.exec("reset role");
    assert.equal(await scalar(`select status as value from billing_subscriptions where organization_id='${otherOrg}'`), "past_due");
    await assume(operator);
    await assert.rejects(step("settle", "BANK-002", renewal, reducedPayment), /Archive surplus agents/);
    await db.exec(`reset role; update agents set agent_status='archived' where id=(select id from agents limit 1)`);
    await assume(operator);
    await assert.rejects(step("settle", "BANK-001", renewal, reducedPayment), /unique constraint/);
    await step("settle", "BANK-002", renewal, reducedPayment);
    await assert.rejects(step("refund", "REFUND-001", initial, reducedPayment), /original gross payment/);
    await step("refund", "REFUND-001", initial, payment);
    await db.exec("reset role");
    assert.equal(await scalar(`select base_price::int as value from organization_entitlements where organization_id='${otherOrg}'`), 600);
    assert.equal(await scalar(`select max_active_agents as value from organization_entitlements where organization_id='${otherOrg}'`), 6);
    assert.equal(await scalar(`select status as value from organization_entitlements where organization_id='${otherOrg}'`), "active");
    await assume(operator);
    await step("refund", "REFUND-002", renewal, reducedPayment);
    await step("refund", "REFUND-002", renewal, reducedPayment);
    await db.exec("reset role");
    assert.equal(await scalar(`select status as value from organization_entitlements where organization_id='${otherOrg}'`), "expired");
    assert.equal(await scalar(`select count(*)::int as value from billing_payments where organization_id='${otherOrg}' and status='refunded' and refunded_amount=amount`), 2);
    await assume(operator);
    await step("offboard", "EXIT-001", null);
    await assert.rejects(step("quote", "QUOTE-AFTER", null, { ...dates(-1, 26), amount: 699 }), /offboarded/);
    await db.exec("reset role");
    assert.equal(await scalar(`select status as value from organization_entitlements where organization_id='${otherOrg}'`), "cancelled");
    console.log("PASS W16 isolated PostgreSQL lifecycle: approval and gross receipt gates, atomic rollback, replay, tenant roles, renewal and reduction, overdue, cancellation, refunds, offboarding; duplicate signed Stripe delivery rejected while checkout is disabled.");
    console.log("PASS assisted-only endpoints; actual PostgreSQL migration; anon/owner/service denial; invoice amount/currency; atomic rollback; idempotency; matching payment/subscription/entitlement; tenant reads.");
  } finally { await db.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
