import Link from "next/link";
import { getCommercialCatalog } from "@/lib/commercial/catalog";

export const dynamic = "force-dynamic";

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
      <p className="pricing-note">Public Beta prices are configurable commercial hypotheses. Taxes, AI usage, complex integrations, and separately scoped implementation work may apply.</p>
    </main>
  );
}
