import Link from "next/link";
import { redirect } from "next/navigation";
import { resolveOrganizationContext } from "@/lib/auth/organization-context";
export const dynamic = "force-dynamic";
const sections = [
  { title: "Company profile", href: "/company/profile", description: "Identity and company details" },
  { title: "Members & roles", href: "/company#members", description: "People and permissions" },
  { title: "Integrations", href: "/integrations", description: "Connected services and credentials" },
  { title: "Notifications", href: "/notifications", description: "How you hear from RYTHM" },
  { title: "Billing", href: "/billing", description: "Plan and payments" },
  { title: "Company knowledge", href: "/company-library", description: "Shared operating context" },
];
export default async function SettingsPage() {
  if (!await resolveOrganizationContext()) redirect("/login?next=/settings");
  return <main className="command-shell"><header className="command-header"><div><p className="eyebrow">Workspace configuration</p><h1>Settings</h1><p className="subtitle">Manage your company, connections and preferences.</p></div></header><div className="simple-link-grid">{sections.map(section => <Link className="panel" key={section.href} href={section.href}><h2>{section.title}</h2><p>{section.description}</p><span>Open settings →</span></Link>)}</div></main>;
}
