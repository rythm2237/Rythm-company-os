import type { Metadata } from "next";
import Link from "next/link";
import { getCommercialCatalog } from "@/lib/commercial/catalog";
import { createPublicMetadata } from "@/lib/seo/site";

export const dynamic = "force-dynamic";
export const metadata: Metadata = createPublicMetadata("/pricing");

export default async function PricingPage() {
  const offers = await getCommercialCatalog();

  return (
    <main className="marketing-section pricing-page">
      <div className="marketing-section-heading">
        <p className="marketing-kicker">PUBLIC BETA PRICING</p>
        <h1>Choose the level of company control you need.</h1>
        <p>AI model usage is metered separately so every organization can keep a visible budget ceiling.</p>
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
    </main>
  );
}
