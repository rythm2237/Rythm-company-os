import Link from "next/link";
import { getCommercialCatalog } from "@/lib/commercial/catalog";

type Props = { searchParams: Promise<{ offer?: string }> };

export const dynamic = "force-dynamic";

export default async function ContactPage({ searchParams }: Props) {
  const { offer: requestedCode } = await searchParams;
  const offers = await getCommercialCatalog();
  const requestedOffer = offers.find((offer) => offer.offer_code === requestedCode);
  const salesEmail = process.env.NEXT_PUBLIC_SALES_EMAIL;

  return (
    <main className="marketing-section contact-page">
      <div className="marketing-section-heading">
        <p className="marketing-kicker">ENTERPRISE & ASSISTED BUILD</p>
        <h1>Plan a governed implementation with RYTHM.</h1>
        <p>{requestedOffer ? `You selected ${requestedOffer.name}. ${requestedOffer.summary}` : "Discuss Enterprise AI Workforce or add RYTHM Assisted Build to an eligible subscription."}</p>
      </div>
      <section className="contact-card">
        <h2>{requestedOffer?.cta_label ?? "Start a commercial conversation"}</h2>
        <p>Enterprise onboarding and assisted implementations are reviewed manually during Public Beta.</p>
        {salesEmail ? (
          <a className="marketing-button" href={`mailto:${salesEmail}?subject=${encodeURIComponent(`RYTHM inquiry — ${requestedOffer?.name ?? "Enterprise"}`)}`}>Email RYTHM Sales</a>
        ) : (
          <p className="contact-notice">The direct sales channel is being configured. You can create a Human CEO account now or return when Enterprise Beta intake opens.</p>
        )}
        <div className="hero-actions"><Link href="/signup">Create an account</Link><Link href="/pricing">Return to pricing</Link></div>
      </section>
    </main>
  );
}
