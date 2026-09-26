import Link from "next/link";
import { getPlatformAdminContext } from "@/lib/admin/authorization";
import { listCustomers, display, date, product } from "@/lib/admin/customers";
export const dynamic = "force-dynamic";
export default async function CustomersPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; sort?: string; page?: string }> }) {
  if (!await getPlatformAdminContext()) return null;
  const params = await searchParams;
  const page = Math.min(100000, Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1));
  const search = (params.q ?? "").slice(0, 200), status = params.status ?? "", sort = params.sort ?? "newest";
  const data = await listCustomers({ search, status, sort, page });
  const pageUrl = (next: number) => `/admin/customers?${new URLSearchParams({ q: search, status, sort, page: String(next) })}`;
  return <main className="admin-studio customer-console">
    <section className="admin-hero"><div><p className="admin-kicker">PLATFORM / CUSTOMERS</p><h1>Customer companies</h1><p>Accounts, people and AI workforces across RYTHM. Each company remains isolated.</p></div><Link href="/admin">Admin Studio</Link></section>
    <section className="admin-panel"><form className="customer-filters" role="search">
      <label>Search companies<input name="q" defaultValue={search} maxLength={200} placeholder="Company, owner, email, website, ID, plan or country" /></label>
      <label>Status<select name="status" defaultValue={status}><option value="">All statuses</option><option value="approved">Approved</option><option value="draft">Draft</option><option value="review">Review</option><option value="rejected">Rejected</option><option value="archived">Archived</option></select></label>
      <label>Sort by<select name="sort" defaultValue={sort}><option value="newest">Newest</option><option value="name">Company name</option><option value="activity">Recent activity</option><option value="agents">Agent count</option></select></label>
      <button className="admin-primary-action" type="submit">Apply</button><Link href="/admin/customers">Reset</Link>
    </form><p role="status">{data.total} matching {data.total === 1 ? "company" : "companies"}</p>
    <div className="customer-table-scroll"><table className="customer-table"><caption className="sr-only">Customer company inventory</caption><thead><tr><th>Company</th><th>Owner / contact</th><th>Status</th><th>Product / plan</th><th>People / agents</th><th>Activity</th></tr></thead><tbody>
      {data.items.map(c => <tr key={c.id}><td><Link prefetch={false} href={`/admin/customers/${c.id}`}><strong>{c.name}</strong></Link><small>{display(c.website_url)}</small><small>{display(c.country_code)} · {c.id}</small></td><td>{display(c.owner_name)}<small>{display(c.owner_email)}</small></td><td><span className="admin-status">{c.status}</span><small>Onboarding: {display(c.onboarding_status)}</small></td><td>{product(c.product_code)}<small>{display(c.plan_code)} · {display(c.entitlement_status)}</small></td><td>{c.user_count} active users<small>{c.agent_count} agents · {c.active_agent_count} enabled</small><small>{c.integration_count} integrations</small></td><td>{date(c.last_activity)}<small>Created {date(c.created_at)}</small></td></tr>)}
    </tbody></table></div>
    {!data.items.length ? <p className="admin-empty">{data.total ? "No companies on this page. Return to the first page." : "No customer companies match these filters."}</p> : null}
    <nav className="customer-pagination" aria-label="Customer pages">{page > 1 ? <Link href={pageUrl(page - 1)}>← Previous</Link> : null}<span>Page {page} of {Math.max(1, Math.ceil(data.total / 25))}</span>{page * 25 < data.total ? <Link href={pageUrl(page + 1)}>Next →</Link> : null}</nav>
    </section>
  </main>;
}
