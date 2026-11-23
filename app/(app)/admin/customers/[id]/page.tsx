import Link from "next/link";
import CompanyLogo from "@/components/company-branding/CompanyLogo";
import { notFound } from "next/navigation";
import { getPlatformAdminContext } from "@/lib/admin/authorization";
import { getCustomer, display, date, product } from "@/lib/admin/customers";
import { AssistedBilling } from "./assisted-billing";
export const dynamic = "force-dynamic";
export default async function CustomerPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams?: Promise<{ activation?: string; activationError?: string }> }) {
  const admin = await getPlatformAdminContext();
  if (!admin) return null;
  const data = await getCustomer((await params).id);
  if (!data) notFound();
  const { company: c, entitlement: e, counts } = data;
  const notice = await searchParams;
  const assisted = e && ["ready_company", "company_studio"].includes(e.product_code);
  const orders = assisted ? await admin.supabase.from("assisted_billing_orders")
    .select("id,quote_reference,state,invoice_reference,net_amount,vat_amount,currency,period_start,period_end,due_at,agent_limit")
    .eq("organization_id", c.id).order("period_start", { ascending: false }) : null;
  return <main className="admin-studio customer-console">
    <section className="admin-hero"><div><Link href="/admin/customers">← Customer companies</Link><p className="admin-kicker">CUSTOMER ACCOUNT / {c.status}</p><div className="customer-detail-brand"><CompanyLogo organizationId={c.id} name={c.name} version={data.logo_version} size={72} /><h1>{c.name}</h1></div><p>{c.id}</p></div><span className="admin-status">Service metadata only</span></section>
    <section className="admin-panel"><h2>Customer privacy</h2><p>This platform view contains only service metadata and aggregate counts. Personal identities, contact details, internal company content, agent names and configuration, integration details, usage costs, and activity histories are not available here.</p></section>
    <section className="admin-metrics">
      <article><span>Users</span><strong>{counts.users}</strong><small>{counts.memberships} total memberships</small></article>
      <article><span>Agents</span><strong>{counts.agents}</strong><small>{counts.enabled_agents} enabled · {counts.agents - counts.enabled_agents - counts.archived_agents} disabled · {counts.archived_agents} archived</small></article>
      <article><span>Integrations</span><strong>{counts.integrations}</strong><small>{counts.connected_integrations} connected and enabled</small></article>
      <article><span>Product</span><strong>{product(e?.product_code)}</strong><small>{display(e?.plan_code)}</small></article>
    </section>
    <section className="admin-panel"><h2>Service account</h2><dl className="customer-facts">{[
      ["Company", c.name], ["Organization ID", c.id], ["Status", c.status], ["Created", date(c.created_at)]
    ].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{display(value)}</dd></div>)}</dl></section>
    <section className="admin-panel"><h2>Products & entitlements</h2>{e ? <dl className="customer-facts"><div><dt>Product / plan</dt><dd>{product(e.product_code)} / {e.plan_code}</dd></div><div><dt>Recorded status</dt><dd>{e.status}</dd></div><div><dt>Validity</dt><dd>{date(e.starts_at)} → {date(e.ends_at)}</dd></div><div><dt>Agent capacity</dt><dd>{e.max_active_agents}</dd></div><div><dt>Agent Studio</dt><dd>{e.agent_builder_enabled ? "Enabled" : "Disabled"}</dd></div><div><dt>Create / archive</dt><dd>{e.agent_create_enabled ? "Enabled" : "Disabled"} / {e.agent_archive_enabled ? "Enabled" : "Disabled"}</dd></div></dl> : <p>No product entitlement recorded.</p>}</section>
    {assisted && <section className="admin-panel"><h2>Assisted billing lifecycle</h2>
      <p>Record evidence from the approved accounting and contract systems. A signed order and professional review are required before payment confirmation.</p>
      {notice?.activation === "recorded" ? <p role="status">Billing update recorded.</p> : null}
      {notice?.activationError ? <p role="alert">{notice.activationError}</p> : null}
      {orders?.error ? <p role="alert">Assisted billing records are unavailable.</p>
        : <AssistedBilling company={c.id} orders={orders?.data ?? []} offboarded={e.status === "cancelled"}/>}
    </section>}
    <section className="admin-panel"><h2>Access protection</h2><p>Only allowlisted RYTHM platform administrators can access this view. Each read is audited. The database response excludes confidential fields, including for direct API calls. Viewing a company does not switch your workspace or grant company-owner permissions.</p></section>
  </main>;
}
