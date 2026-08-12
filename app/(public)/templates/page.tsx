import type { Metadata } from "next";
import Link from "next/link";
import { PUBLIC_TEMPLATES } from "@/lib/public-experience/content";
import { createPublicMetadata } from "@/lib/seo/site";

export const metadata: Metadata = createPublicMetadata("/templates");

export default function PublicTemplatesPage() {
  return (
    <main>
      <section className="public-page-hero templates-hero">
        <div><p className="marketing-kicker">PUBLIC TEMPLATE DISCOVERY</p><h1>See how a governed AI company can be organized before you provision one.</h1></div>
        <div><p>These are curated public descriptions. They do not expose tenant templates, unlock commercial access, or provision anything into Production.</p><Link className="marketing-text-link" href="/demo?surface=templates">See templates inside the Demo <span aria-hidden="true">→</span></Link></div>
      </section>
      <section className="marketing-section public-template-grid" aria-label="Public company templates">
        {PUBLIC_TEMPLATES.map((template) => (
          <article key={template.id}>
            <p className="marketing-kicker">{template.family}</p>
            <h2>{template.name}</h2>
            <p className="template-audience"><strong>Best for:</strong> {template.audience}</p>
            <p>{template.description}</p>
            <div className="template-counts"><span><strong>{template.departments || "Custom"}</strong> Departments</span><span><strong>{template.agents || "Custom"}</strong> AI Agents</span></div>
            <ul>{template.capabilities.map((capability) => <li key={capability}>{capability}</li>)}</ul>
            <Link href={template.id === "nova-commerce" ? "/demo" : "/pricing"}>{template.id === "nova-commerce" ? "Explore in Demo" : "Compare availability"} <span aria-hidden="true">→</span></Link>
          </article>
        ))}
      </section>
    </main>
  );
}
