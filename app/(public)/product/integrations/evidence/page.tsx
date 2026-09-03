import type { Metadata } from "next";
import Link from "next/link";

const DESCRIPTION =
  "Review the current RYTHM integration evidence register, implemented provider contracts, operation boundaries, governance controls, and explicit non-partnership claim boundary.";

const PROVIDERS = [
  ["GitHub", "Repository read/write, branches, pull requests", "https://docs.github.com/en/rest"],
  ["Vercel", "Deployment read, preview deploy, production deploy", "https://vercel.com/docs/rest-api"],
  ["Supabase", "Schema/data read and governed migration application", "https://supabase.com/docs/reference/api/introduction"],
  ["Cloudflare", "DNS read/write", "https://developers.cloudflare.com/api/overview/"],
  ["Stripe", "Billing read and governed refunds", "https://docs.stripe.com/api"],
  ["Google Workspace", "Calendar read/write and Gmail send", "https://developers.google.com/workspace"],
  ["Microsoft 365", "Calendar read/write and mail send through Microsoft Graph", "https://learn.microsoft.com/graph/overview"],
  ["Resend", "Governed outbound email", "https://resend.com/docs/api-reference/introduction"],
] as const;

export const metadata: Metadata = {
  title: { absolute: "Integration Evidence | RYTHM Company OS" },
  description: DESCRIPTION,
  alternates: { canonical: "/product/integrations/evidence" },
  openGraph: {
    type: "website",
    url: "/product/integrations/evidence",
    siteName: "RYTHM Company OS",
    title: "Integration Evidence | RYTHM Company OS",
    description: DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: "Integration Evidence | RYTHM Company OS",
    description: DESCRIPTION,
  },
};

export default function IntegrationEvidencePage() {
  return (
    <main className="knowledge-page">
      <nav className="public-breadcrumbs" aria-label="Breadcrumb">
        <Link href="/">RYTHM Company OS</Link>
        <span aria-hidden="true">/</span>
        <Link href="/product/integrations">Integrations</Link>
        <span aria-hidden="true">/</span>
        <span aria-current="page">Evidence</span>
      </nav>

      <section className="public-page-hero knowledge-hero">
        <div>
          <p className="marketing-kicker">VERIFIABLE INTEGRATION EVIDENCE</p>
          <h1>Implemented provider contracts, without inflated partnership claims.</h1>
        </div>
        <p>
          This register documents provider integrations represented in the current RYTHM execution gateway. It distinguishes implemented technical capability from customer availability, marketplace approval, certification, or official partnership.
        </p>
      </section>

      <section className="knowledge-definition" aria-label="Evidence claim boundary">
        <p className="marketing-kicker">CLAIM BOUNDARY</p>
        <p>
          RYTHM does not claim an official partnership with the providers listed here unless separate reciprocal evidence exists. A registered tool or adapter proves an implemented integration boundary; it does not prove that every customer can connect every provider today.
        </p>
      </section>

      <section className="marketing-section knowledge-section">
        <div className="marketing-section-heading">
          <p className="marketing-kicker">CURRENT PROVIDER EVIDENCE</p>
          <h2>Eight provider families are represented in the governed gateway.</h2>
          <p>All consequential writes remain subject to the applicable permissions, scopes, risk policy, approval path, execution mode, and configured credentials.</p>
        </div>
        <div className="knowledge-card-grid">
          {PROVIDERS.map(([name, capability, docs]) => (
            <article key={name}>
              <h3>{name}</h3>
              <p>{capability}.</p>
              <a href={docs}>Official provider API documentation</a>
            </article>
          ))}
        </div>
      </section>

      <section className="marketing-section knowledge-section">
        <div className="marketing-section-heading">
          <p className="marketing-kicker">REPRODUCIBLE SOURCES</p>
          <h2>The public evidence can be checked against the implementation.</h2>
        </div>
        <div className="knowledge-card-grid">
          <article>
            <h3>Tool registry</h3>
            <p>Provider IDs, tool IDs, operations, scopes, risk levels, approval policy, idempotency, rollback support, and execution mode.</p>
            <a href="https://github.com/rythm2237/Rythm-company-os/blob/main/lib/integrations/registry.ts">Inspect registry source</a>
          </article>
          <article>
            <h3>Provider adapters</h3>
            <p>Provider host allowlists, adapter routing, execution, verification, health checks, and supported compensating actions.</p>
            <a href="https://github.com/rythm2237/Rythm-company-os/blob/main/lib/integrations/adapters/provider-adapters.ts">Inspect adapter source</a>
          </article>
          <article>
            <h3>Machine-readable register</h3>
            <p>Versioned provider, operation, documentation, execution-mode, and partnership-claim fields.</p>
            <a href="/integration-evidence-v1.json">Open JSON evidence register</a>
          </article>
        </div>
      </section>

      <section className="marketing-cta knowledge-cta">
        <p className="marketing-kicker">INTERPRETATION</p>
        <h2>Connection, authorization, and execution are separate states.</h2>
        <p>
          Provider credentials and customer-specific availability remain deployment-specific. A connected account still requires the correct scope, Agent capability, user permission, policy result, and Human CEO approval where consequential action is involved.
        </p>
        <div className="hero-actions">
          <Link className="marketing-button" href="/product/integrations">Review integration architecture</Link>
          <Link href="/ai-transparency">Review AI governance</Link>
        </div>
        <p className="page-review-note">Reviewed and updated 2026-09-03.</p>
      </section>
    </main>
  );
}
