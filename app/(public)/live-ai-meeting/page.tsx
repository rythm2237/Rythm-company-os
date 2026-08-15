import type { Metadata } from "next";
import Link from "next/link";
import { createPublicMetadata } from "@/lib/seo/site";

export const metadata: Metadata = createPublicMetadata("/live-ai-meeting");

const ROLES = ["CEO Advisor", "Strategy Advisor", "Operations Manager", "Finance Analyst", "Marketing Strategist", "Research Analyst", "Process Specialist"];

export default function LiveAiMeetingPage() {
  return (
    <main>
      <section className="public-page-hero meeting-product-hero">
        <div><p className="marketing-kicker">TRY RYTHM WITH YOUR OWN PROBLEM</p><h1>Run a governed AI meeting around a real business objective.</h1><p>Bring your context into a temporary RYTHM Boardroom, work with relevant AI roles and optional human participants, then receive a structured outcome.</p><div className="hero-actions"><Link className="marketing-button marketing-button-large" href="/enterprise?offer=live_ai_meeting">Request Beta access</Link><Link className="marketing-text-link" href="/demo?surface=boardroom">Explore the Demo Boardroom</Link></div></div>
        <aside className="meeting-agenda-card"><p className="marketing-kicker">MEETING M-PREVIEW</p><span>Objective</span><h2>Choose the strongest path for a margin-sensitive growth initiative.</h2><div><span>Human chair</span><strong>You · Final authority</strong></div><div><span>AI participants</span><strong>Strategy · Finance · Operations</strong></div><footer>Temporary context · Structured output · No autonomous action</footer></aside>
      </section>
      <section className="marketing-section meeting-flow-section"><div className="marketing-section-heading"><p className="marketing-kicker">THE EXPERIENCE</p><h2>A Boardroom flow—not a generic chatbot.</h2></div><div className="meeting-flow-grid">{["Choose one objective", "Add business context", "Confirm AI and human roles", "Review limits and governance", "Enter the temporary Boardroom", "Receive a structured outcome"].map((step, index) => <article key={step}><span>0{index + 1}</span><h3>{step}</h3></article>)}</div></section>
      <section className="meeting-roles-section"><div><p className="marketing-kicker">PARTICIPATING ROLES</p><h2>Use recommended specialists or shape the meeting around your objective.</h2></div><div>{ROLES.map((role) => <span key={role}>{role}</span>)}</div></section>
      <section className="marketing-section meeting-boundary-section"><div className="marketing-section-heading"><p className="marketing-kicker">EXPLICIT PRODUCT BOUNDARY</p><h2>One governed experience. Not a cheap substitute for a Company OS.</h2></div><div className="boundary-grid"><article><h3>Included in the trial meeting</h3><ul><li>One objective and bounded duration</li><li>Limited AI roles and usage</li><li>Temporary context and workspace</li><li>Structured decisions and action output</li></ul></article><article><h3>Reserved for a subscription</h3><ul><li>Persistent Company Memory</li><li>Ongoing Projects and AI workforce</li><li>Automation and continuous training</li><li>Permanent governance and company intelligence</li></ul></article></div><p className="configuration-note">Beta price, resource limits, availability, and any subscription credit will come from the commercial catalog and conversion rules. They are not hard-coded into this page.</p></section>
      <section className="marketing-section enterprise-model">
        <div className="enterprise-capabilities"><p className="marketing-kicker">CONSUMER PURCHASES</p><h2>One-off consumer payment will only open after the compliant checkout is connected.</h2><ul><li>Before a consumer can pay, checkout must show the exact service scope, total VAT-inclusive price, payment method, performance timing and withdrawal consequences.</li><li>A one-off meeting purchase will not create a recurring subscription unless the consumer separately and expressly orders one.</li><li>If immediate performance during the withdrawal period is requested, RYTHM will collect the required express request and acknowledgement before starting the paid service.</li><li>Raw payment-card data will not be stored directly by RYTHM.</li></ul><p><Link href="/consumer-rights">Read Consumer Rights →</Link></p></div>
        <div className="enterprise-capabilities"><p className="marketing-kicker">CURRENT PAYMENT STATE</p><h2>Online checkout is not yet active.</h2><p>The current Beta-access action is not a consumer payment order and does not create an online payment obligation. A future payment button must use unambiguous pay-order wording and will remain disabled until VAT, invoicing and payment-provider controls are production-ready.</p></div>
      </section>
    </main>
  );
}
