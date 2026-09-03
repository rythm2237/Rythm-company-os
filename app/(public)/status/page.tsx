import type { Metadata } from "next";
import Link from "next/link";
import PublicPageStructuredData from "@/components/brand/PublicPageStructuredData";
import { getPublicStatusSnapshot } from "@/lib/public-status";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "System Status | RYTHM Company OS",
  description: "Current Production readiness signals, service-status boundaries, and incident communication expectations for RYTHM Company OS.",
  alternates: { canonical: "/status" },
  openGraph: {
    type: "website",
    url: "/status",
    siteName: "RYTHM Company OS",
    title: "System Status | RYTHM Company OS",
    description: "Current Production readiness signals, service-status boundaries, and incident communication expectations for RYTHM Company OS.",
  },
  twitter: {
    card: "summary_large_image",
    title: "System Status | RYTHM Company OS",
    description: "Current Production readiness signals and incident communication expectations for RYTHM Company OS.",
  },
};

function labelForStatus(status: string) {
  switch (status) {
    case "operational": return "Operational";
    case "configured": return "Configured";
    case "enabled": return "Enabled under controls";
    case "locked_by_default": return "Locked by default";
    case "degraded": return "Degraded";
    default: return "Attention required";
  }
}

export default function StatusPage() {
  const snapshot = getPublicStatusSnapshot();
  const reviewedDate = new Date(snapshot.observedAt).toLocaleString("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  });

  return (
    <main>
      <PublicPageStructuredData
        path="/status"
        name="RYTHM Company OS System Status"
        description="Current Production readiness signals, status boundaries, and incident communication expectations for RYTHM Company OS."
        breadcrumbLabel="System Status"
        dateModified="2026-09-03"
      />

      <section className="public-page-hero enterprise-hero">
        <div>
          <p className="marketing-kicker">SYSTEM STATUS</p>
          <h1>Current Production readiness, without invented uptime claims.</h1>
        </div>
        <div>
          <p>
            This page publishes the current configuration-readiness signals that RYTHM can verify from Production. It does not represent a contractual SLA, synthetic uptime history, or continuous dependency probe.
          </p>
          <p className="contact-notice">Observed {reviewedDate} UTC</p>
        </div>
      </section>

      <section className="marketing-section enterprise-model">
        <div className="enterprise-capabilities">
          <p className="marketing-kicker">CURRENT SIGNAL</p>
          <h2>{snapshot.status === "operational" ? "Production readiness is operational." : snapshot.status === "degraded" ? "Production readiness is degraded." : "Production readiness requires attention."}</h2>
          <p>
            The overall signal is derived from required Production configuration for authentication/data access and the approved AI runtime. A successful page response also confirms that the web application served this request.
          </p>
          <div className="hero-actions"><a href="/api/status">Machine-readable status</a><Link href="/support">Report a problem</Link></div>
        </div>
        <div className="enterprise-capabilities">
          <p className="marketing-kicker">MEASUREMENT BOUNDARY</p>
          <h2>What this page does not claim.</h2>
          <ul>
            <li>No historical uptime percentage is published yet.</li>
            <li>No response-time or availability SLA is implied by the current status.</li>
            <li>Configured means required Production configuration is present; it does not prove every downstream dependency is responding at this instant.</li>
            <li>No statement of “zero incidents” is made for periods before a formal public incident log exists.</li>
          </ul>
        </div>
      </section>

      <section className="marketing-section">
        <div className="marketing-section-heading">
          <p className="marketing-kicker">COMPONENTS</p>
          <h2>Current Production readiness signals</h2>
        </div>
        <div className="pricing-grid">
          {snapshot.components.map((component) => (
            <article className="pricing-card" key={component.key}>
              <p className="offer-category">{labelForStatus(component.status)}</p>
              <h2>{component.label}</h2>
              <p>{component.detail}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="marketing-section enterprise-model">
        <div className="enterprise-capabilities">
          <p className="marketing-kicker">INCIDENT HISTORY</p>
          <h2>Public incident history starts when evidence exists.</h2>
          <p>
            RYTHM does not currently publish a historical incident ledger. This should not be interpreted as evidence that no prior interruption has occurred. Future material incidents can be added only with verified timestamps, affected components, customer impact, mitigation, and resolution evidence.
          </p>
        </div>
        <div className="enterprise-capabilities">
          <p className="marketing-kicker">INCIDENT COMMUNICATION</p>
          <h2>Report observable service problems through Support.</h2>
          <p>
            Include the affected page, approximate time, observed behavior, and safe reproduction steps. Do not send passwords, tokens, API keys, one-time authentication links, or unnecessary customer-confidential data.
          </p>
          <div className="hero-actions"><Link href="/support">Support</Link><Link href="/security">Security reporting</Link></div>
        </div>
      </section>
    </main>
  );
}
