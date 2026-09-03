import type { Metadata } from "next";
import Link from "next/link";

const DESCRIPTION =
  "Factual media resources for RYTHM Company OS, including product positioning, founder identity, governance boundaries, research, integration evidence, and press contact.";

export const metadata: Metadata = {
  title: { absolute: "Press & Media | RYTHM Company OS" },
  description: DESCRIPTION,
  alternates: { canonical: "/press" },
  openGraph: {
    type: "website",
    url: "/press",
    siteName: "RYTHM Company OS",
    title: "Press & Media | RYTHM Company OS",
    description: DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: "Press & Media | RYTHM Company OS",
    description: DESCRIPTION,
  },
};

const FACTS = [
  ["Category", "Governed AI workforce platform"],
  ["Secondary descriptor", "AI company operating system"],
  ["Product status", "Public Beta"],
  ["Founder / operator", "Yaser Tayyebialashti"],
  ["Operating entity", "Tayyebialashti Yaser E.V., Hungary"],
  ["Human authority", "Consequential authority remains with the Human CEO"],
] as const;

export default function PressPage() {
  return (
    <main className="knowledge-page">
      <nav className="public-breadcrumbs" aria-label="Breadcrumb">
        <Link href="/">RYTHM Company OS</Link>
        <span aria-hidden="true">/</span>
        <span aria-current="page">Press & Media</span>
      </nav>

      <section className="public-page-hero knowledge-hero">
        <div>
          <p className="marketing-kicker">PRESS & MEDIA</p>
          <h1>Factual resources for independent coverage of RYTHM.</h1>
        </div>
        <p>
          This page provides verifiable product and founder facts for journalists, analysts,
          researchers, directory editors, and technical writers. It is not a substitute for
          independent reporting and does not present self-published material as third-party coverage.
        </p>
      </section>

      <section className="marketing-section knowledge-section">
        <div className="marketing-section-heading">
          <p className="marketing-kicker">CORE FACTS</p>
          <h2>Use only claims that can be verified from public RYTHM sources.</h2>
        </div>
        <div className="knowledge-card-grid">
          {FACTS.map(([title, detail]) => (
            <article key={title}>
              <h3>{title}</h3>
              <p>{detail}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="marketing-section knowledge-section">
        <div className="marketing-section-heading">
          <p className="marketing-kicker">VERIFICATION SOURCES</p>
          <h2>Primary sources for fact checking.</h2>
        </div>
        <div className="knowledge-card-grid">
          <article><h3>About</h3><p>Product category, audience, operating model, founder/operator identity.</p><Link href="/about">Open About</Link></article>
          <article><h3>Governance research</h3><p>Versioned synthetic benchmark methodology and dataset; no superiority claim.</p><Link href="/research/governed-ai-workforce-benchmark">Open Research</Link></article>
          <article><h3>Integration evidence</h3><p>Implemented provider contracts and explicit non-partnership claim boundary.</p><Link href="/product/integrations/evidence">Open Integration Evidence</Link></article>
          <article><h3>Trust & security</h3><p>Public Beta controls, limits, security posture, and AI transparency.</p><Link href="/trust">Open Trust Center</Link></article>
          <article><h3>Legal identity</h3><p>Public operator identity and official business/contact information.</p><Link href="/legal">Open Legal Notice</Link></article>
          <article><h3>Machine-readable facts</h3><p>Versioned press facts for reproducible reference.</p><a href="/press-facts-v1.json">Open JSON facts</a></article>
        </div>
      </section>

      <section className="knowledge-definition" aria-label="Independent coverage boundary">
        <p className="marketing-kicker">INDEPENDENCE BOUNDARY</p>
        <p>
          RYTHM does not label its own website, GitHub repository, LinkedIn company page, press materials,
          or founder-authored posts as independent third-party coverage. Coverage is recorded only when an
          unaffiliated external publisher independently publishes a substantive mention.
        </p>
      </section>

      <section className="marketing-cta knowledge-cta">
        <p className="marketing-kicker">PRESS CONTACT</p>
        <h2>For factual questions, interviews, or technical verification.</h2>
        <p>Use the official general contact channel and identify the publication or research context.</p>
        <div className="hero-actions">
          <a className="marketing-button" href="mailto:hello@rythm-os.com">hello@rythm-os.com</a>
          <a href="https://hu.linkedin.com/in/tayyebialashti" rel="noreferrer">Founder LinkedIn</a>
        </div>
        <p className="page-review-note">Reviewed and updated 2026-09-03.</p>
      </section>
    </main>
  );
}
