import assert from "node:assert/strict";
import Module from "node:module";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { isRedirectError } from "next/dist/client/components/redirect-error";

async function main() {
  Object.assign(globalThis, { React });
  const own = "00000000-0000-4000-8000-000000000020";
  const date = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString();
  let role: string | null = "owner";
  let paid = false;
  const reads: string[] = [];
  const mock = {
    auth: { getUser: async () => ({ data: { user: role ? { id: "synthetic-user" } : null } }) },
    rpc: async () => ({ data: [{
      organization_id: own, organization_name: "Synthetic company", organization_status: "approved",
      organization_slug: "synthetic", membership_role: role, is_active: true,
    }], error: null }),
    from(table: string) {
      const filters: Record<string, string> = {};
      const entitlement = { status: "active", starts_at: date(-1), ends_at: date(1),
        product_code: "ready_company", base_price: 249, currency: "EUR", billing_interval: "month" };
      const result = (single: boolean) => {
        if (table.startsWith("billing_")) {
          assert.equal(filters.organization_id, own, "Billing queries must bind the selected tenant");
          reads.push(table);
        }
        if (table === "organization_entitlements") return { data: entitlement };
        if (table === "billing_subscriptions") return { data: paid ? [{
          id: "sub", provider: "manual", status: "active", current_period_start: date(-1),
          current_period_end: date(1), latest_provider_invoice_id: "invoice", cancel_at_period_end: true,
        }] : [] };
        if (table === "billing_payments" && single) {
          assert.deepEqual(filters, { organization_id: own, subscription_id: "sub", provider: "manual",
            provider_invoice_id: "invoice", status: "succeeded" });
          return { data: { id: "pay" } };
        }
        return { data: single ? null : [] };
      };
      const query = {
        select: () => query,
        eq: (key: string, value: string) => { filters[key] = value; return query; },
        order: () => query,
        limit: () => query,
        maybeSingle: async () => result(true),
        then: (resolve: (value: ReturnType<typeof result>) => void) => resolve(result(false)),
      };
      return query;
    },
  };
  const loader = Module as unknown as { _load: (id: string, ...args: unknown[]) => unknown };
  const original = loader._load;
  loader._load = function(id, ...args) {
    if (id === "@/lib/supabase/auth-server") return { createAuthServerClient: async () => mock };
    if (id === "server-only") return {};
    return original.call(this, id, ...args);
  };
  try {
    const [{ default: Billing }, { AssistedBilling }] = await Promise.all([
      import("../app/(app)/billing/page"),
      import("../app/(app)/admin/customers/[id]/assisted-billing"),
    ]);
    for (const deniedRole of [null, "member", "admin"]) {
      role = deniedRole;
      await assert.rejects(Billing, (error: unknown) => isRedirectError(error)
        && error.digest.includes(deniedRole ? "/command-center" : "/setup/company"));
      assert.equal(reads.length, 0, "Denied viewers may not query financial records");
    }
    role = "owner";
    const unpaid = renderToStaticMarkup(await Billing());
    assert.match(unpaid, /Active · recorded status/);
    assert.match(unpaid, /No confirmed payment for a current assisted period/);
    assert.doesNotMatch(unpaid, /Confirm payment and activate service/);
    paid = true;
    const paidPage = renderToStaticMarkup(await Billing());
    assert.match(paidPage, /Confirmed paid/);
    assert.match(paidPage, /Cancel at period end/);
    const order = { id: "order", quote_reference: "QUOTE", state: "signed", invoice_reference: null,
      net_amount: 249, vat_amount: null, currency: "EUR", period_start: date(-1),
      period_end: date(1), due_at: null, agent_limit: null };
    const financeReview = renderToStaticMarkup(<AssistedBilling company={own} orders={[order]} offboarded={false}/>);
    assert.match(financeReview, /Record finance approval/);
    assert.doesNotMatch(financeReview, /Confirm payment and activate service/);
    const approved = renderToStaticMarkup(<AssistedBilling company={own} orders={[{ ...order, state: "approved" }]} offboarded={false}/>);
    assert.match(approved, /Confirm payment and activate service/);
    console.log("PASS billing server-rendered UI with synthetic auth: anonymous/member/admin redirect before billing reads, owner tenant scope, paid vs active, and finance-review action visibility.");
  } finally {
    loader._load = original;
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
