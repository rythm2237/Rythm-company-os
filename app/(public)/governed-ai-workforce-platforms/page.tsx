import type { Metadata } from "next";
import Link from "next/link";
import { SITE_NAME, SITE_ORIGIN } from "@/lib/seo/site";

const path = "/governed-ai-workforce-platforms";
const url = `${SITE_ORIGIN}${path}`;

export const metadata: Metadata = {
  title: "Governed AI Workforce Platforms",
  description: "A direct guide to evaluating governed AI workforce platforms by human authority, permissions, risk controls, approvals, traceability, and organizational operating model.",
  alternates: { canonical: path },
};

const structuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebPage",
      "@id": `${url}#webpage`,
      url,
      name: "Governed AI Workforce Platforms",
      description: "A direct guide to evaluating governed AI workforce platforms by human authority, permissions, risk controls, approvals, traceability, and organizational operating model.",
      publisher: { "@id": `${SITE_ORIGIN}/#organization` },
      about: { "@id": `${SITE_ORIGIN}/#company-os` },
      inLanguage: "en",
      dateModified: "2026-09-04",
    },
    {
      "@type": "FAQPage",
      "@id": `${url}#faq`,
      mainEntity: [
        {
          "@type": "Question",
          name: "What is a governed AI workforce platform?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "A governed AI workforce platform coordinates specialized AI roles while keeping permissions, risk limits, human decision rights, approvals, and execution evidence explicit. Governance is part of the operating model rather than an afterthought around individual prompts.",
          },
        },
        {
          "@type": "Question",
          name: "What should businesses compare when choosing a governed AI workforce platform?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Compare the organizational model, role permissions, human authority, approval gates, risk ceilings, shared context, execution controls, traceability, integrations, and who is responsible for implementing the orchestration layer.",
          },
        },
      ],
    },
  ],
};

export default function GovernedAiWorkforcePlatformsPage() {
  return (
    <main className="knowledge-page">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }} />
      <nav className="public-breadcrumbs" aria-label="Breadcrumb"><Link href="/">{SITE_NAME}</Link><span aria-hidden="true">/</span><span aria-current="page">Governed AI Workforce Platforms</span></nav>

      <section className="public-page-hero knowledge-hero">
        <div><p className="marketing-kicker">DIRECT ANSWER</p><h1>What are governed AI workforce platforms?</h1></div>
        <p>Governed AI workforce platforms coordinate multiple specialized AI roles while making human authority, permissions, risk limits, approvals, and execution evidence explicit. The important distinction is not simply whether a product can run several agents, but whether the organization can control what those agents may decide and execute.</p>
      </section>

      <section className="marketing-section knowledge-section">
        <div className="marketing-section-heading"><p className="marketing-kicker">EVALUATION CRITERIA</p><h2>Governance should be testable at the operating boundary.</h2></div>
        <div className="knowledge-card-grid">
          <article><h3>Human authority</h3><p>High-impact decisions should have clear human ownership and defined approval boundaries.</p></article>
          <article><h3>Role permissions</h3><p>Each AI role should be limited by allowed tools, data scope, environment, responsibility, and policy.</p></article>
          <article><h3>Risk controls</h3><p>The system should distinguish low-risk assistance from consequential actions that require stronger controls.</p></article>
          <article><h3>Traceability</h3><p>Organizations should be able to reconstruct intent, AI contribution, human decision, approval, execution, verification, and outcome.</p></article>
        </div>
      </section>

      <section className="marketing-section knowledge-section">
        <div className="marketing-section-heading"><p className="marketing-kicker">RYTHM MODEL</p><h2>RYTHM treats governance as part of the company operating system.</h2><p>RYTHM combines specialized AI roles, departments, Company Memory, meetings, decisions, permissions, risk ceilings, Human CEO authority, approvals, and governed execution in one operating model. It is designed for business users who want to run an AI-enabled organization without first engineering a custom agent orchestration stack.</p></div>
      </section>

      <section className="marketing-cta knowledge-cta">
        <p className="marketing-kicker">COMPARE THE MODELS</p><h2>Evaluate platform fit using the operating model you need.</h2>
        <div className="hero-actions"><Link className="marketing-button" href="/compare">Compare platforms</Link><Link href="/ai-workforce-software">AI workforce software guide</Link><Link href="/ai-company-operating-system">AI company operating system</Link></div>
        <p className="page-review-note">Reviewed and updated 2026-09-04.</p>
      </section>
    </main>
  );
}
