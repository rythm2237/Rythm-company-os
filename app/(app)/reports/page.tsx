import Link from "next/link";
import { redirect } from "next/navigation";
import { resolveOrganizationContext } from "@/lib/auth/organization-context";
export const dynamic = "force-dynamic";
const sections = [
  { title: "Company performance", href: "/executive-review", description: "Executive outcomes and decisions" },
  { title: "Project performance", href: "/projects", description: "Roadmaps, delivery and results" },
  { title: "Department & agent performance", href: "/evaluations", description: "Workforce assessment" },
  { title: "Costs", href: "/finance", description: "Finance and operating economics" },
  { title: "SEO performance", href: "/agency/seo", description: "Client website analysis" },
  { title: "Operational health", href: "/operations/health", description: "Connection and execution health" },
];
export default async function ReportsPage() {
  if (!await resolveOrganizationContext()) redirect("/login?next=/reports");
  return <main className="command-shell"><header className="command-header"><div><p className="eyebrow">Outcomes</p><h1>Reports</h1><p className="subtitle">See what your company has delivered and where it needs to improve.</p></div></header><div className="simple-link-grid">{sections.map(section => <Link className="panel" key={section.href} href={section.href}><h2>{section.title}</h2><p>{section.description}</p><span>Open report →</span></Link>)}</div></main>;
}
