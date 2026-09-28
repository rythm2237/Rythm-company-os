import Link from "next/link";
import { redirect } from "next/navigation";
import { getPlatformAdminContext } from "@/lib/admin/authorization";
import { capabilityRegistry } from "@/lib/admin/capability-status";

export const dynamic = "force-dynamic";

export default async function CapabilitiesPage() {
  if (!await getPlatformAdminContext()) redirect("/command-center");
  return <main className="command-shell">
    <header className="command-header"><div><p className="eyebrow">PRODUCT ADMIN · CAPABILITY STATUS</p><h1>What RYTHM can actually do</h1><p className="subtitle">Conservative implementation inventory. Repository evidence does not verify a Production tenant or provider connection.</p></div><Link className="secondary-button" href="/admin">Admin Studio</Link></header>
    <section className="panel panel-wide"><div className="data-list">{capabilityRegistry.map(capability => <article className="data-row" key={capability.id}><div><strong>{capability.name}</strong><span>{capability.gap}</span><small>Evidence: {capability.evidence.length ? capability.evidence.join(" · ") : "No implementation evidence recorded"}</small></div><span className="pill">{capability.status.replaceAll("_", " ")}</span></article>)}</div></section>
  </main>;
}
