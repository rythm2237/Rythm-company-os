import Link from "next/link";
import { getCommercialCatalog } from "@/lib/commercial/catalog";
import ProductTourShelf from "./_components/ProductTourShelf";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const offers = await getCommercialCatalog();
  const primaryOffers = offers.filter((offer) => offer.category !== "service");
  const assistedBuild = offers.find((offer) => offer.offer_code === "assisted_build");

  function discoveryHref(offerCode: string) {
    if (offerCode === "ready_ai_company") return "/templates";
    if (offerCode === "custom_ai_company") return "/product#custom-company";
    return "/enterprise";
  }

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
            <Link className="marketing-button marketing-button-large" href="/product">Explore the Company OS</Link>
            <Link className="marketing-text-link" href="/demo">Open the interactive Demo</Link>
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

      <section className="experience-entry-section" aria-label="Ways to experience RYTHM">
        <Link href="/demo"><span>INTERACTIVE DEMO</span><strong>Enter Nova Commerce</strong><small>Explore a synthetic Company OS workspace <i aria-hidden="true">→</i></small></Link>
        <Link href="/product"><span>PRODUCT EXPLAINER</span><strong>Understand the operating loop</strong><small>Workforce, memory, meetings, governance <i aria-hidden="true">→</i></small></Link>
        <Link href="/live-ai-meeting"><span>LIVE AI MEETING</span><strong>Try RYTHM with your problem</strong><small>Preview the governed Boardroom experience <i aria-hidden="true">→</i></small></Link>
      </section>

      <section className="marketing-section how-section" id="how-it-works">
        <div className="marketing-section-heading"><p className="marketing-kicker">HOW IT WORKS</p><h2>From business intent to governed execution.</h2><p>See the operating model before comparing commercial paths.</p></div>
        <div className="how-grid">
          <article><span>01</span><h3>Give work organizational context</h3><p>Agents have roles, departments, managers, authority, risk, and explicit AI identity.</p></article>
          <article><span>02</span><h3>Deliberate with evidence</h3><p>Humans and relevant AI specialists meet around an agenda, context, and decision boundary.</p></article>
          <article><span>03</span><h3>Keep authority human</h3><p>Recommendations become consequential work only through the required approval path.</p></article>
          <article><span>04</span><h3>Preserve the operating trace</h3><p>Intent, meetings, decisions, approvals, actions, and outcomes remain connected.</p></article>
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

      <div className="marketing-section"><ProductTourShelf compact /></div>

      <section className="marketing-section" id="products">
        <div className="marketing-section-heading">
          <p className="marketing-kicker">COMPARE AFTER YOU EXPLORE</p>
          <h2>Three paths. One governed operating foundation.</h2>
          <p>Start ready-made, design your own company, or plan an enterprise workforce deployment.</p>
        </div>
        <div className="offer-grid">
          {primaryOffers.map((offer) => (
            <article className="offer-card" key={offer.offer_code}>
              <p className="offer-category">{offer.category}</p>
              <h3>{offer.name}</h3>
              <p className="offer-audience">{offer.audience}</p>
              <p>{offer.summary}</p>
              <ul>{offer.features.map((feature) => <li key={feature}>{feature}</li>)}</ul>
              <Link className="offer-link" href={discoveryHref(offer.offer_code)}>Explore this path</Link>
            </article>
          ))}
        </div>
        {assistedBuild ? (
          <article className="assisted-strip">
            <div><p className="marketing-kicker">OPTIONAL SERVICE</p><h3>{assistedBuild.name}</h3><p>{assistedBuild.summary}</p></div>
            <div><Link href="/enterprise?offer=assisted_build">Understand Assisted Build</Link></div>
          </article>
        ) : null}
      </section>

      <section className="marketing-cta">
        <p className="marketing-kicker">EXPERIENCE BEFORE ADMINISTRATION</p>
        <h2>Enter the operating environment before you create an account.</h2>
        <p>The public Demo is synthetic and read-only. A persistent company begins only after signup, guided solution selection, provisioning, and active commercial entitlement.</p>
        <div className="hero-actions"><Link className="marketing-button marketing-button-large" href="/demo">Explore Nova Commerce</Link><Link href="/pricing">Compare products</Link></div>
      </section>
    </main>
  );
}
