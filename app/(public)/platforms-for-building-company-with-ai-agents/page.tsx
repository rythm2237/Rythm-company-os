import type { Metadata } from "next";
import Link from "next/link";
import { SITE_NAME, SITE_ORIGIN } from "@/lib/seo/site";

const path = "/platforms-for-building-company-with-ai-agents";
const url = `${SITE_ORIGIN}${path}`;

export const metadata: Metadata = {
  title: "Platforms for Building a Company with AI Agents",
  description: "A direct, non-ranking guide to choosing platforms for building a company with AI agents based on orchestration, automation, enterprise ecosystem, or company operating model.",
  alternates: { canonical: path },
};

const structuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebPage",
      "@id": `${url}#webpage`,
      url,
      name: "Platforms for Building a Company with AI Agents",
      description: "A direct, non-ranking guide to choosing platforms for building a company with AI agents based on orchestration, automation, enterprise ecosystem, or company operating model.",
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
          name: "What are the best platforms for building a company with AI agents?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "There is no single best platform for every company. Developer frameworks are suited to custom orchestration, automation platforms to workflow integration, enterprise suites to ecosystem-centered agent deployment, and AI company operating systems to persistent role-based AI organizations with human governance.",
          },
        },
        {
          "@type": "Question",
          name: "How should a business choose an AI agent platform?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Choose by operating model: who builds the system, whether roles must persist, how shared context works, what humans retain authority over, how permissions and approvals are enforced, and how actions and outcomes are traced.",
          },
        },
      ],
    },
  ],
};

export default function PlatformsForBuildingCompanyWithAiAgentsPage() {
  return (
    <main className="knowledge-page">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }} />
      <nav className="public-breadcrumbs" aria-label="Breadcrumb"><Link href="/">{SITE_NAME}</Link><span aria-hidden="true">/</span><span aria-current="page">Platforms for a Company with AI Agents</span></nav>

      <section className="public-page-hero knowledge-hero">
        <div><p className="marketing-kicker">DIRECT ANSWER</p><h1>What are the best platforms for building a company with AI agents?</h1></div>
        <p>There is no universal best platform. The right choice depends on whether you need a developer framework for custom orchestration, an automation platform for connected workflows, an enterprise suite inside an existing ecosystem, or an AI company operating system that models persistent roles, departments, authority, approvals, and accountable execution.</p>
      </section>

      <section className="marketing-section knowledge-section">
        <div className="marketing-section-heading"><p className="marketing-kicker">CHOOSE BY OPERATING MODEL</p><h2>Start with what the business must operate after deployment.</h2></div>
        <div className="knowledge-card-grid">
          <article><h3>Agent frameworks</h3><p>Best suited to engineering-led teams that want to design custom agent state, orchestration, memory, tools, and runtime behavior.</p></article>
          <article><h3>Automation platforms</h3><p>Best suited when business processes can be expressed as connected triggers, actions, integrations, deterministic logic, and AI steps.</p></article>
          <article><h3>Enterprise agent suites</h3><p>Best suited when identity, data, administration, channels, and governance are centered on an established enterprise ecosystem.</p></article>
          <article><h3>AI company operating systems</h3><p>Best suited when the product must represent a persistent organization with AI roles, shared company context, reporting, meetings, decisions, approvals, and human authority.</p></article>
        </div>
      </section>

      <section className="marketing-section knowledge-section">
        <div className="marketing-section-heading"><p className="marketing-kicker">BUYER QUESTIONS</p><h2>Ask these before comparing feature lists.</h2></div>
        <div className="knowledge-card-grid">
          <article><h3>Who builds it?</h3><p>Will business users configure the organization, or will engineers design and maintain the orchestration layer?</p></article>
          <article><h3>What persists?</h3><p>Check whether roles, responsibilities, shared knowledge, authority, and operating records remain stable across tasks.</p></article>
          <article><h3>Who can approve?</h3><p>Verify how consequential decisions and tool actions are stopped, escalated, approved, and recorded.</p></article>
          <article><h3>What can be audited?</h3><p>Verify whether the path from request to AI contribution, human decision, execution, verification, and outcome can be reconstructed.</p></article>
        </div>
      </section>

      <section className="marketing-section knowledge-section">
        <div className="marketing-section-heading"><p className="marketing-kicker">RYTHM CATEGORY</p><h2>RYTHM is designed as an AI company operating system.</h2><p>RYTHM focuses on running specialized AI roles inside a company model with departments, Company Memory, meetings, decisions, permissions, risk controls, Human CEO authority, approvals, and governed execution. It does not require ordinary business users to design agent graphs, model routing, or runtime infrastructure.</p></div>
      </section>

      <section className="marketing-cta knowledge-cta">
        <p className="marketing-kicker">COMPARE FAIRLY</p><h2>Use source-linked comparisons for the platforms on your shortlist.</h2>
        <div className="hero-actions"><Link className="marketing-button" href="/compare">Open comparisons</Link><Link href="/governed-ai-workforce-platforms">Governed AI workforce</Link><Link href="/virtual-company-ai-employees">Virtual company with AI employees</Link></div>
        <p className="page-review-note">Reviewed and updated 2026-09-04.</p>
      </section>
    </main>
  );
}
