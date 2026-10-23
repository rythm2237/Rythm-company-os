import type { Metadata } from "next";
import Link from "next/link";
import OrganizationStructuredData from "@/components/brand/OrganizationStructuredData";
import { getCommercialCatalog } from "@/lib/commercial/catalog";
import { createPublicMetadata } from "@/lib/seo/site";
import ProductTourShelf from "./_components/ProductTourShelf";
import BoardroomHeroMotion from "./_components/BoardroomHeroMotion";
import "./boardroom-home.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = createPublicMetadata("/");

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
    <>
      <OrganizationStructuredData />
      <main className="boardroom-home">
      <section className="boardroom-hero" aria-labelledby="boardroom-hero-title">
        <BoardroomHeroMotion />
        <p className="boardroom-scene-caption">Illustrative AI team · Human CEO authority</p>
        <div className="boardroom-hero-copy">
          <div className="boardroom-hero-heading">
          <p className="boardroom-eyebrow">AI COMPANY OPERATING SYSTEM</p>
          <h1 id="boardroom-hero-title">Build your<br />AI company.<br /><span>Lead the way.</span></h1>
          </div>
          <div className="boardroom-hero-details">
          <p className="boardroom-hero-description">
            Bring specialized AI agents together as one team. Set the direction,
            review the decisions, and stay in control.
          </p>
          <div className="boardroom-hero-actions">
            <Link className="boardroom-primary" href="/demo">Explore the demo <span aria-hidden="true">↗</span></Link>
            <Link className="boardroom-secondary" href="/product">See how it works</Link>
          </div>
          <p className="boardroom-trust">Human-led. Connected teams. Governed execution.</p>
          </div>
        </div>
      </section>

      <section className="boardroom-principles" aria-label="Your company operating foundation">
        <div><span>01 / WORKFORCE</span><strong>Specialized AI roles</strong></div>
        <div><span>02 / CONTEXT</span><strong>Shared company memory</strong></div>
        <div><span>03 / AUTHORITY</span><strong>Human approval</strong></div>
        <div><span>04 / DELIVERY</span><strong>Traceable execution</strong></div>
      </section>

      <section className="experience-entry-section boardroom-entries" aria-label="Ways to experience RYTHM">
        <Link href="/demo"><span>INTERACTIVE DEMO</span><strong>Enter Nova Commerce</strong><small>Explore a synthetic Company OS workspace <i aria-hidden="true">→</i></small></Link>
        <Link href="/product"><span>PRODUCT EXPLAINER</span><strong>Understand the operating loop</strong><small>Workforce, memory, meetings, governance <i aria-hidden="true">→</i></small></Link>
        <Link href="/live-ai-meeting"><span>LIVE AI MEETING</span><strong>Try RYTHM with your problem</strong><small>Preview the governed Boardroom experience <i aria-hidden="true">→</i></small></Link>
      </section>

      <section className="marketing-section how-section boardroom-team-section" aria-labelledby="business-native-title">
        <div className="marketing-section-heading">
          <p className="marketing-kicker">BUSINESS-NATIVE AI</p>
          <h2 id="business-native-title">One company. Connected intelligence.</h2>
          <p>
            RYTHM is designed for business users, not only AI specialists. You work with familiar concepts—roles, departments, managers, meetings, decisions, approvals, and responsibilities—while model routing, orchestration, permissions, and execution infrastructure stay behind the product experience.
          </p>
        </div>
        <div className="how-grid">
          <article><span>01</span><h3>Specialized AI roles</h3><p>Give each AI agent a clear business responsibility, company context, and a defined scope of work.</p></article>
          <article><span>02</span><h3>Connected departments</h3><p>Organize your workforce into teams with managers, reporting relationships, and shared objectives.</p></article>
          <article><span>03</span><h3>Collaborative decisions</h3><p>Bring the relevant AI and human roles together around an objective, with evidence and shared company memory.</p></article>
          <article><span>04</span><h3>Human approval</h3><p>Review consequential decisions and authorize the work. Your company keeps a trace from intent to outcome.</p></article>
        </div>
        <div className="hero-actions"><Link href="/product">See the business-native operating model</Link><Link href="/demo">Try the public demo</Link></div>
      </section>

      <section className="marketing-section how-section" id="how-it-works">
        <div className="marketing-section-heading"><p className="marketing-kicker">HOW IT WORKS</p><h2>From business intent to governed execution.</h2><p>See the operating model before comparing commercial paths.</p></div>
        <div className="how-grid">
          <article><span>01</span><h3>Give work organizational context</h3><p>Agents have roles, departments, managers, authority, risk, and explicit AI identity.</p></article>
          <article><span>02</span><h3>Deliberate with evidence</h3><p>Humans and relevant AI specialists meet around an agenda, context, and decision boundary.</p></article>
          <article><span>03</span><h3>Keep authority human</h3><p>Recommendations become consequential work only through the required approval path.</p></article>
          <article><span>04</span><h3>Preserve the operating trace</h3><p>Intent, meetings, decisions, approvals, actions, and outcomes remain connected.</p></article>
        </div>
        <div className="hero-actions"><Link href="/ai-workforce">Understand the AI workforce</Link><Link href="/how-it-works">Read the full operating model</Link><Link href="/ai-agents-for-business">Explore business AI Agents</Link></div>
      </section>

      <section className="marketing-section how-section" aria-labelledby="category-definition-title">
        <div className="marketing-section-heading">
          <p className="marketing-kicker">WHAT RYTHM IS</p>
          <h2 id="category-definition-title">An AI company operating system—not an agent framework or automation builder.</h2>
          <p>
            RYTHM is software for creating and operating a business AI workforce as an organization:
            AI roles have reporting lines, permissions, company context, approval boundaries, execution controls,
            and a Human CEO who retains consequential authority.
          </p>
        </div>
        <div className="how-grid">
          <article><span>01</span><h3>Different from ChatGPT</h3><p>ChatGPT is a general AI assistant. RYTHM organizes multiple specialized AI Agents into persistent business roles with company context, governance, and accountable work.</p></article>
          <article><span>02</span><h3>Different from n8n or Zapier</h3><p>Automation platforms connect triggers and actions. RYTHM adds organizational roles, deliberation, human decision rights, risk policy, approvals, and traceability around AI-driven work.</p></article>
          <article><span>03</span><h3>Different from LangGraph or CrewAI</h3><p>Agent frameworks help developers build agent workflows. RYTHM is an operating product for companies that need an AI workforce, company structure, governance, and controlled execution.</p></article>
          <article><span>04</span><h3>Different from Copilot Studio</h3><p>Copilot Studio builds agents inside the Microsoft ecosystem. RYTHM focuses on the company operating layer: AI departments, reporting relationships, Human CEO authority, meetings, decisions, approvals, and cross-system execution governance.</p></article>
        </div>
        <div className="hero-actions">
          <Link href="/ai-company-operating-system">What is an AI company operating system?</Link>
          <Link href="/compare">Compare AI workforce platforms</Link>
          <Link href="/product-architecture">Review the architecture</Link>
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
    </>
  );
}
