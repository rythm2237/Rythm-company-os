import type { Metadata } from "next";
import Link from "next/link";
import ProductStructuredData from "@/components/brand/ProductStructuredData";
import { createPublicMetadata } from "@/lib/seo/site";
import ProductTourShelf from "../_components/ProductTourShelf";

export const metadata: Metadata = createPublicMetadata("/product");

const OPERATING_SYSTEM = [
  { step: "01", title: "Intent", detail: "Ideas, objectives, issues, and company context enter with a clear human owner." },
  { step: "02", title: "Deliberation", detail: "Relevant AI roles and humans meet around an agenda, evidence, and authority boundaries." },
  { step: "03", title: "Decision", detail: "Options, dissent, assumptions, and the requested Human CEO authority stay visible." },
  { step: "04", title: "Execution", detail: "Approved decisions become accountable actions and project work—not autonomous external behavior." },
  { step: "05", title: "Memory & trace", detail: "Outcomes return to governed company context with a complete operating lineage." },
] as const;

export default function ProductPage() {
  return (
    <>
      <ProductStructuredData />
      <main>
      <section className="public-page-hero product-page-hero">
        <div>
          <p className="marketing-kicker">THE GOVERNED COMPANY OPERATING SYSTEM</p>
          <h1>AI becomes more useful when it has a role, context, and a human authority model.</h1>
          <p>RYTHM brings an AI workforce into one operating environment for company memory, projects, meetings, decisions, approvals, actions, economics, and traceability.</p>
          <div className="hero-actions">
            <Link className="marketing-button marketing-button-large" href="/demo">Open the Demo Workspace</Link>
            <Link className="marketing-text-link" href="/solutions">Explore solution paths</Link>
          </div>
        </div>
        <aside className="product-principles" aria-label="RYTHM product principles">
          <p className="marketing-kicker">OPERATING PRINCIPLES</p>
          <div><span>01</span><strong>Human CEO has final authority</strong></div>
          <div><span>02</span><strong>Agents are explicit organizational members</strong></div>
          <div><span>03</span><strong>Commercial access fails closed</strong></div>
          <div><span>04</span><strong>Every consequential handoff is traceable</strong></div>
        </aside>
      </section>

      <section className="marketing-section operating-loop-section">
        <div className="marketing-section-heading">
          <p className="marketing-kicker">ONE OPERATING LOOP</p>
          <h2>From business intent to governed execution.</h2>
          <p>RYTHM is not a collection of disconnected chatbots. Work moves through a company system with roles, decisions, evidence, and authority.</p>
        </div>
        <div className="operating-loop-grid">
          {OPERATING_SYSTEM.map((item) => <article key={item.step}><span>{item.step}</span><h3>{item.title}</h3><p>{item.detail}</p></article>)}
        </div>
      </section>

      <section className="marketing-section company-system-section" id="custom-company">
        <div className="marketing-section-heading">
          <p className="marketing-kicker">A COMPANY, NOT A TOOLBOX</p>
          <h2>The workforce, management system, and governance layer stay connected.</h2>
        </div>
        <div className="system-layer-grid">
          <article><p>01 · WORKFORCE</p><h3>Agents with organizational identity</h3><span>Role · Department · Manager · Activity · Authority · Risk</span></article>
          <article><p>02 · OPERATIONS</p><h3>Persistent company coordination</h3><span>Memory · Projects · Meetings · Decisions · Actions</span></article>
          <article><p>03 · GOVERNANCE</p><h3>Human authority and evidence</h3><span>Approvals · Traceability · Economics · Audit · Controls</span></article>
        </div>
      </section>

      <div className="marketing-section"><ProductTourShelf /></div>

      <section className="marketing-cta">
        <p className="marketing-kicker">UNDERSTAND BEFORE YOU CHOOSE</p>
        <h2>Explore the operating environment, then compare the right company model.</h2>
        <div className="hero-actions"><Link className="marketing-button" href="/demo">Explore Nova Commerce</Link><Link href="/pricing">Compare products</Link></div>
      </section>
      </main>
    </>
  );
}
