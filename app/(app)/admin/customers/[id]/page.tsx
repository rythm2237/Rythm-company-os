import Link from "next/link";
import { notFound } from "next/navigation";
import { getPlatformAdminContext } from "@/lib/admin/authorization";
import { getCustomer, display, date, product } from "@/lib/admin/customers";
export const dynamic = "force-dynamic";
export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  if (!await getPlatformAdminContext()) return null;
  const data = await getCustomer((await params).id);
  if (!data) notFound();
  const { company: c, entitlement: e, counts } = data;
  return <main className="admin-studio customer-console">
    <section className="admin-hero"><div><Link href="/admin/customers">← Customer companies</Link><p className="admin-kicker">CUSTOMER ACCOUNT / {c.status}</p><h1>{c.name}</h1><p>{c.id}</p></div><span className="admin-status">Service metadata only</span></section>
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
    <section className="admin-panel"><h2>Access protection</h2><p>Only allowlisted RYTHM platform administrators can access this view. Each read is audited. The database response excludes confidential fields, including for direct API calls. Viewing a company does not switch your workspace or grant company-owner permissions.</p></section>
  </main>;
}
