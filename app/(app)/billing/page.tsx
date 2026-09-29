import Link from "next/link";
import { requireOwnerOrganizationContext, isOrganizationEntitlementActive } from "@/lib/auth/organization-context";
import { ASSISTED_ACTIVATION_COPY } from "@/lib/commercial/activation-policy";

export const dynamic = "force-dynamic";
const money = (amount: number, currency: string) => new Intl.NumberFormat("en-IE", { style: "currency", currency }).format(amount);

export default async function BillingPage() {
  const context = await requireOwnerOrganizationContext();
  const [subscriptions, payments, entitlement] = await Promise.all([
    context.supabase.from("billing_subscriptions").select("id,provider,status,currency,current_period_start,current_period_end,metadata").eq("organization_id", context.organizationId).order("created_at", { ascending: false }),
    context.supabase.from("billing_payments").select("id,provider,status,provider_invoice_id,amount,currency,paid_at").eq("organization_id", context.organizationId).order("created_at", { ascending: false }).limit(20),
    context.supabase.from("organization_entitlements").select("product_code,status,base_price,currency,billing_interval,ends_at").eq("organization_id", context.organizationId).maybeSingle(),
  ]);
  if (subscriptions.error || payments.error || entitlement.error) throw new Error("Billing records are temporarily unavailable. Please retry.");
  const active = isOrganizationEntitlementActive(context.entitlement);
  return <main className="command-shell finance-shell">
    <header className="command-header"><div><p className="eyebrow">ASSISTED B2B BILLING</p><h1>Billing & activation</h1><p className="subtitle">{ASSISTED_ACTIVATION_COPY}</p></div></header>
    <section className="panel"><h2>{context.organization.name}</h2><dl>
      <dt>Organization ID</dt><dd>{context.organizationId}</dd>
      <dt>Product</dt><dd>{entitlement.data?.product_code ?? "No company product selected"}</dd>
      <dt>Company access</dt><dd>{active ? "Active" : "Inactive"} · recorded status: {entitlement.data?.status ?? "Not recorded"}</dd>
      <dt>Subscription base price</dt><dd>{entitlement.data ? `${money(Number(entitlement.data.base_price), entitlement.data.currency)} / ${entitlement.data.billing_interval} + AI usage` : "Commercial confirmation required"}</dd>
    </dl><p>AI usage and provider costs are agreed separately. A company subscription does not include a personal AI plan allowance.</p>
    <Link className="primary-button" href="/contact?topic=activation">Request invoice or billing help</Link>{!active ? <p><Link href="/activation">View activation steps</Link></p> : null}</section>
    <section className="panel"><h2>Recorded service periods</h2>{subscriptions.data?.length ? <ul>{subscriptions.data.map(record => <li key={record.id}>{record.provider} · recorded status: {record.status} · {record.current_period_start ?? "Start not recorded"} → {record.current_period_end ?? "End not recorded"}</li>)}</ul> : <p>No subscription record is available. Existing account access does not by itself confirm that an invoice was paid.</p>}</section>
    <section className="panel"><h2>Recorded payments</h2>{payments.data?.length ? <ul>{payments.data.map(record => <li key={record.id}>{record.provider} · recorded status: {record.status} · {money(Number(record.amount), record.currency)} · {record.provider_invoice_id ?? "Reference not recorded"}</li>)}</ul> : <p>No confirmed payment is recorded.</p>}</section>
    <p><Link href="/ai">Return to RYTHM AI</Link></p>
  </main>;
}
