import type { Metadata } from "next";
import Link from "next/link";
import PublicPageStructuredData from "@/components/brand/PublicPageStructuredData";
import { getCommercialCatalog } from "@/lib/commercial/catalog";
import { createPublicMetadata } from "@/lib/seo/site";

export const dynamic = "force-dynamic";
export const metadata: Metadata = createPublicMetadata("/pricing");

export default async function PricingPage() {
  const offers = await getCommercialCatalog();

  return (
    <>
      <PublicPageStructuredData
        breadcrumbLabel="Pricing"
        dateModified="2026-09-01"
        description="Compare Public Beta pricing for Ready AI Company, Custom AI Company, Enterprise AI Workforce, assisted implementation, and metered AI usage."
        name="RYTHM Company OS Pricing"
        path="/pricing"
      />
      <main className="pricing-page">
      <section className="marketing-section">
      <div className="marketing-section-heading">
        <p className="marketing-kicker">PUBLIC BETA PRICING</p>
        <h1>Choose the level of company control you need.</h1>
        <p>AI model usage is metered separately so every organization can keep a visible budget ceiling. Catalog reviewed 1 September 2026.</p>
      </div>
      <div className="pricing-grid">
        {offers.map((offer) => (
          <article className="pricing-card" key={offer.offer_code}>
            <p className="offer-category">{offer.category}</p>
            <h2>{offer.name}</h2>
            <strong className="offer-price">{offer.price_label}</strong>
            <p>{offer.summary}</p>
            <ul>{offer.features.map((feature) => <li key={feature}>{feature}</li>)}</ul>
            <Link className="offer-link" href={offer.cta_href}>{offer.cta_label}</Link>
          </article>
        ))}
      </div>
      <div className="pricing-note">
        <p>Displayed Public Beta catalog prices are commercial starting points and are not yet a consumer checkout total. For a consumer purchase, the final checkout must display the full amount payable including applicable VAT/taxes, mandatory charges, billing interval, duration, renewal and cancellation conditions before any payment obligation is created.</p>
        <p>Online consumer payment remains disabled until that calculation and invoicing flow is connected. Read <Link href="/consumer-rights">Consumer Rights</Link> and <Link href="/consumer-terms">Consumer Terms</Link>.</p>
      </div>
      </section>

      <section className="marketing-section enterprise-model">
        <div className="enterprise-capabilities"><p className="marketing-kicker">CHOOSING A PLAN</p><h2>Match the plan to organizational control.</h2><ul><li><strong>Ready AI Company:</strong> a predefined workforce and operating model for faster setup.</li><li><strong>Custom AI Company:</strong> editable departments, Agents, hierarchy and governance through Company Studio.</li><li><strong>Enterprise AI Workforce:</strong> discovery, integration architecture, custom capacity and controlled rollout.</li><li><strong>Assisted Build:</strong> expert-supported company design, Agent configuration and structured handover.</li></ul></div>
        <div className="enterprise-capabilities"><p className="marketing-kicker">COST BOUNDARIES</p><h2>Subscription price is not the complete operating cost.</h2><ul><li>AI model usage is metered separately from the subscription or implementation fee.</li><li>Connected provider costs, taxes, internal change management and customer infrastructure may be separate.</li><li>The final consumer checkout must show the full payable total and contractual terms before purchase.</li><li>Enterprise scope and implementation requirements are confirmed through a separate review.</li></ul></div>
      </section>

      <section className="marketing-section knowledge-faq">
        <div className="marketing-section-heading"><p className="marketing-kicker">PRICING QUESTIONS</p><h2>What buyers need to know</h2></div>
        <div className="knowledge-answer-list">
          <article><h3>Is AI usage included?</h3><p>No. The current catalog states that AI model usage is metered separately so the organization can apply a visible budget ceiling.</p></article>
          <article><h3>Is there a free plan?</h3><p>No free persistent company plan is currently listed. The public Demo is synthetic and read-only and can be explored before signup.</p></article>
          <article><h3>Can I switch from Ready to Custom?</h3><p>Commercial migration terms are not promised on this page. Contact Sales before purchase if future company-structure portability is a decision requirement.</p></article>
          <article><h3>Are integrations included?</h3><p>Integration architecture and availability depend on the plan, provider, rollout state and customer configuration. Provider usage fees may be separate.</p></article>
        </div>
      </section>
      </main>
    </>
  );
}
