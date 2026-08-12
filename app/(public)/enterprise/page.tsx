import type { Metadata } from "next";
import Link from "next/link";
import { getCommercialCatalog } from "@/lib/commercial/catalog";
import { createPublicMetadata } from "@/lib/seo/site";

export const metadata: Metadata = createPublicMetadata("/enterprise");

type Props = { searchParams: Promise<{ offer?: string }> };

export const dynamic = "force-dynamic";

export default async function EnterprisePage({ searchParams }: Props) {
  const { offer: requestedCode } = await searchParams;
  const offers = await getCommercialCatalog();
  const requestedOffer = offers.find((offer) => offer.offer_code === requestedCode);
  const liveMeetingRequested = requestedCode === "live_ai_meeting";
  const salesEmail = process.env.NEXT_PUBLIC_SALES_EMAIL;
  const inquiryName = liveMeetingRequested ? "Live AI Meeting Beta" : requestedOffer?.name ?? "Enterprise AI Workforce";

  return (
    <main>
      <section className="public-page-hero enterprise-hero">
        <div><p className="marketing-kicker">ENTERPRISE AI WORKFORCE</p><h1>Deploy governed AI teams inside the organization you already have.</h1></div>
        <p>Combine human leadership, AI managers and specialists, departmental knowledge, approval boundaries, auditability, and executive oversight through a controlled Enterprise Beta.</p>
      </section>
      <section className="marketing-section enterprise-model">
        <div className="enterprise-hierarchy" aria-label="Example Enterprise AI workforce hierarchy">
          <div className="is-human"><span>HUMAN</span><strong>Integration Director</strong><small>Final departmental authority</small></div>
          <i aria-hidden="true" />
          <div><span>AI MANAGER</span><strong>Program Manager</strong><small>Governed coordination</small></div>
          <i aria-hidden="true" />
          <section><div><span>AI ROLE</span><strong>Process Analyst</strong></div><div><span>AI ROLE</span><strong>Automation Specialist</strong></div><div><span>AI ROLE</span><strong>Data Analyst</strong></div><div><span>AI ROLE</span><strong>Research Agent</strong></div></section>
        </div>
        <div className="enterprise-capabilities"><p className="marketing-kicker">BETA DIRECTION</p><h2>Enterprise starts with governance architecture, not instant checkout.</h2><ul><li>Department and workforce discovery</li><li>Human manager and AI manager design</li><li>Knowledge and permission boundaries</li><li>Advanced governance and audit planning</li><li>Controlled rollout and executive review</li></ul></div>
      </section>
      <section className="enterprise-contact-section">
        <div><p className="marketing-kicker">{liveMeetingRequested ? "LIVE AI MEETING BETA" : "CONTROLLED BETA INTAKE"}</p><h2>{liveMeetingRequested ? "Bring a real business objective into a governed RYTHM meeting." : "Plan the workforce and controls before deployment."}</h2><p>{requestedOffer ? `You selected ${requestedOffer.name}. ${requestedOffer.summary}` : liveMeetingRequested ? "The paid meeting price and resource limits will be supplied by the commercial catalog before checkout opens." : "Enterprise onboarding and assisted implementations are reviewed manually during Public Beta."}</p></div>
        <div className="enterprise-contact-card"><h3>{inquiryName}</h3>{salesEmail ? <a className="marketing-button" href={`mailto:${salesEmail}?subject=${encodeURIComponent(`RYTHM inquiry — ${inquiryName}`)}`}>Email RYTHM Sales</a> : <p className="contact-notice">The direct sales channel is being configured. No Enterprise entitlement or meeting purchase is implied until the intake channel and commercial flow are active.</p>}<div className="hero-actions"><Link href={liveMeetingRequested ? "/live-ai-meeting" : "/pricing"}>Review product details</Link><Link href="/signup">Create an account</Link></div></div>
      </section>
    </main>
  );
}
