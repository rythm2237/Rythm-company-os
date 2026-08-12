import Link from "next/link";
import { getCommercialCatalog } from "@/lib/commercial/catalog";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const offers = await getCommercialCatalog();
  const primaryOffers = offers.filter((offer) => offer.category !== "service");
  const assistedBuild = offers.find((offer) => offer.offer_code === "assisted_build");

  return (
    <main>
      <section className="marketing-hero">
        <div className="hero-copy">
          <p className="marketing-kicker">GOVERNED AI COMPANY PLATFORM</p>
          <h1>Build a company that can think, coordinate, and operate—with you in control.</h1>
          <p>
            RYTHM gives a Human CEO a specialized AI workforce, company memory, meetings,
            decisions, approvals, actions, and traceability in one governed operating system.
          </p>
          <div className="hero-actions">
            <Link className="marketing-button marketing-button-large" href="/signup?product=company_studio">Build your AI company</Link>
            <Link className="marketing-text-link" href="/#how-it-works">See how RYTHM works</Link>
          </div>
          <div className="trust-row" aria-label="RYTHM governance principles">
            <span>Human CEO authority</span><span>AI identity disclosed</span><span>External actions locked by default</span>
          </div>
        </div>
        <aside className="hero-system-card" aria-label="RYTHM company operating loop">
          <p>YOUR AI COMPANY</p>
          <div><strong>Human CEO</strong><span>Final authority</span></div>
          <div><strong>B-001 Executive Orchestrator</strong><span>Coordinates specialized Agents</span></div>
          <div className="agent-mini-grid"><span>Strategy</span><span>Operations</span><span>Analytics</span><span>Delivery</span></div>
          <footer>Idea → Meeting → Decision → Approval → Action</footer>
        </aside>
      </section>

      <section className="marketing-section" id="products">
        <div className="marketing-section-heading">
          <p className="marketing-kicker">CHOOSE YOUR PATH</p>
          <h2>Start ready-made. Build your own. Scale with control.</h2>
          <p>Every path runs on the same Human CEO governance foundation.</p>
        </div>
        <div className="offer-grid">
          {primaryOffers.map((offer) => (
            <article className="offer-card" key={offer.offer_code}>
              <p className="offer-category">{offer.category}</p>
              <h3>{offer.name}</h3>
              <p className="offer-audience">{offer.audience}</p>
              <p>{offer.summary}</p>
              <strong className="offer-price">{offer.price_label}</strong>
              <ul>{offer.features.map((feature) => <li key={feature}>{feature}</li>)}</ul>
              <Link className="offer-link" href={offer.cta_href}>{offer.cta_label}</Link>
            </article>
          ))}
        </div>
        {assistedBuild ? (
          <article className="assisted-strip">
            <div><p className="marketing-kicker">OPTIONAL SERVICE</p><h3>{assistedBuild.name}</h3><p>{assistedBuild.summary}</p></div>
            <div><strong>{assistedBuild.price_label}</strong><Link href={assistedBuild.cta_href}>{assistedBuild.cta_label}</Link></div>
          </article>
        ) : null}
      </section>

      <section className="marketing-section how-section" id="how-it-works">
        <div className="marketing-section-heading"><p className="marketing-kicker">HOW IT WORKS</p><h2>From business intent to governed execution.</h2></div>
        <div className="how-grid">
          <article><span>01</span><h3>Choose or design</h3><p>Start with a Ready AI Company or define your own structure in Company Studio.</p></article>
          <article><span>02</span><h3>Govern the workforce</h3><p>Set roles, authority, risk ceilings, approval rules, and budget boundaries.</p></article>
          <article><span>03</span><h3>Run the operating loop</h3><p>Turn ideas into meetings, decisions, approvals, and accountable actions.</p></article>
          <article><span>04</span><h3>Review every trace</h3><p>Keep the Human CEO in control with company context and auditable history.</p></article>
        </div>
      </section>

      <section className="governance-section">
        <div><p className="marketing-kicker">DESIGNED FOR RESPONSIBLE CONTROL</p><h2>AI workforce does not mean autonomous authority.</h2></div>
        <ul>
          <li><strong>Human decision rights</strong><span>Consequential authority remains with the Human CEO.</span></li>
          <li><strong>Fail-closed commercial access</strong><span>Pending or inactive entitlements cannot unlock build capabilities.</span></li>
          <li><strong>External action isolation</strong><span>Agents cannot publish, spend, deploy, or message externally by default.</span></li>
          <li><strong>Tenant and audit boundaries</strong><span>Company data and operating events stay organization-scoped and traceable.</span></li>
        </ul>
      </section>

      <section className="marketing-cta">
        <p className="marketing-kicker">BUILD THE COMPANY AROUND YOUR IDEA</p>
        <h2>Your first AI company can be ready before your first hire.</h2>
        <p>Begin with a governed workspace. Commercial capabilities activate only after the selected entitlement is confirmed.</p>
        <div className="hero-actions"><Link className="marketing-button marketing-button-large" href="/signup">Create your Human CEO account</Link><Link href="/pricing">Compare products</Link></div>
      </section>
    </main>
  );
}
