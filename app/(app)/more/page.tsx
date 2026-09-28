import Link from "next/link";
import { redirect } from "next/navigation";
import { resolveOrganizationContext } from "@/lib/auth/organization-context";
export default async function MorePage() {
  if (!await resolveOrganizationContext()) redirect("/login?next=/more");
  return <main className="command-shell"><header className="command-header"><div><h1>More</h1><p className="subtitle">Reports and workspace settings.</p></div></header><div className="simple-link-grid"><Link className="panel" href="/reports"><h2>Reports</h2><p>Results and performance</p></Link><Link className="panel" href="/settings"><h2>Settings</h2><p>Company, integrations and preferences</p></Link></div></main>;
}
