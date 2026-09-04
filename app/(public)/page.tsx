import type { Metadata } from "next";
import Link from "next/link";
import OrganizationStructuredData from "@/components/brand/OrganizationStructuredData";
import { getCommercialCatalog } from "@/lib/commercial/catalog";
import { createPublicMetadata } from "@/lib/seo/site";
import ProductTourShelf from "./_components/ProductTourShelf";

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
      <main>
      <section className="marketing-hero">
        <div className="hero-copy">
          <p className="marketing-kicker">GOVERNED AI WORKFORCE PLATFORM</p>
          <h1>Build and operate an AI workforce—with human authority built in.</h1>
          <p>
            RYTHM Company OS is a governed AI workforce platform and AI company operating system for
            building and running specialized AI Agent teams, Company Memory, meetings, approvals,
            and traceable execution under a Human CEO.
          </p>
          <div className="hero-actions">
            <Link className="marketing-button marketing-button-large" href="/product">Explore the Company OS</Link>
            <Link className="marketing-text-link" href="/demo">Open the interactive Demo</Link>
          </div>
          <div className="trust-row" aria-label="RYTHM governance principles">
            <span>Human CEO authority</span><span>No AI expertise required to operate</span><span>External actions locked by default</span>
          </div>
        </div>
        <aside className="hero-system-card" aria-label="RYTHM company operating loop">
          <header><p>YOUR AI COMPANY</p><span className="hero-system-live"><i aria-hidden="true" /> Operating</span></header>
          <div className="hero-system-node is-human"><span className="hero-node-index">H</span><span><strong>Human CEO</strong><small>Final authority</small></span><i aria-hidden="true">Final review</i></div>
          <div className="hero-system-connector" aria-hidden="true"><span /><i /><span /></div>
          <div className="hero-system-node"><span className="hero-node-index">B</span><span><strong>B-001 Executive Orchestrator</strong><small>Coordinates specialized Agents</small></span><i aria-hidden="true">Active</i></div>
          <div className="agent-mini-grid"><span>Strategy</span><span>Operations</span><span>Analytics</span><span>Delivery</span></div>
          <footer><span>Intent</span><i aria-hidden="true" /><span>Meeting</span><i aria-hidden="true" /><span>Approval</span><i aria-hidden="true" /><span>Action</span></footer>
        </aside>
      </section>

      <section className="experience-entry-section" aria-label="Ways to experience RYTHM">
        <Link href="/demo"><span>INTERACTIVE DEMO</span><strong>Enter Nova Commerce</strong><small>Explore a synthetic Company OS workspace <i aria-hidden="true">→</i></small></Link>
        <Link href="/product"><span>PRODUCT EXPLAINER</span><strong>Understand the operating loop</strong><small>Workforce, memory, meetings, governance <i aria-hidden="true">→</i></small></Link>
        <Link href="/live-ai-meeting"><span>LIVE AI MEETING</span><strong>Try RYTHM with your problem</strong><small>Preview the governed Boardroom experience <i aria-hidden="true">→</i></small></Link>
      </section>

      <section className="marketing-section how-section" aria-labelledby="business-native-title">
        <div className="marketing-section-heading">
          <p className="marketing-kicker">BUSINESS-NATIVE AI</p>
          <h2 id="business-native-title">Run an AI workforce like you run a company—not like you build an AI system.</h2>
          <p>
            RYTHM is designed for business users, not only AI specialists. You work with familiar concepts—roles, departments, managers, meetings, decisions, approvals, and responsibilities—while model routing, orchestration, permissions, and execution infrastructure stay behind the product experience.
          </p>
        </div>
        <div className="how-grid">
          <article><span>01</span><h3>Roles, not prompt engineering</h3><p>Assign work to specialized business roles instead of learning how to construct agent prompts and chains.</p></article>
          <article><span>02</span><h3>Departments, not orchestration graphs</h3><p>Organize the workforce with reporting relationships and responsibilities instead of designing technical agent networks.</p></article>
          <article><span>03</span><h3>Meetings, not model coordination</h3><p>Bring the right AI and human roles together around an objective while RYTHM handles the underlying coordination.</p></article>
          <article><span>04</span><h3>Approvals, not execution plumbing</h3><p>Review and authorize consequential work through normal decision boundaries without managing the technical execution path.</p></article>
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
