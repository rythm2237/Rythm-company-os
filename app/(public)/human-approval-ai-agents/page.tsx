import type { Metadata } from "next";
import Link from "next/link";
import { SITE_NAME, SITE_ORIGIN, SOCIAL_IMAGE_PATH } from "@/lib/seo/site";

const pageTitle = "Human Approval and Consequential Authority for AI Agents";
const pageDescription =
  "A direct guide to human approval, consequential authority, risk ceilings, and governed execution for business AI agents and AI workforces.";
const pageUrl = `${SITE_ORIGIN}/human-approval-ai-agents`;

export const metadata: Metadata = {
  title: pageTitle,
  description: pageDescription,
  alternates: { canonical: "/human-approval-ai-agents" },
  openGraph: {
    type: "website",
    url: "/human-approval-ai-agents",
    siteName: SITE_NAME,
    title: `${pageTitle} | ${SITE_NAME}`,
    description: pageDescription,
    images: [{ url: SOCIAL_IMAGE_PATH, width: 1200, height: 630, alt: "RYTHM Company OS — governed AI workforce platform" }],
  },
  twitter: {
    card: "summary_large_image",
    title: `${pageTitle} | ${SITE_NAME}`,
    description: pageDescription,
    images: [SOCIAL_IMAGE_PATH],
  },
};

const structuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebPage",
      "@id": `${pageUrl}#webpage`,
      url: pageUrl,
      name: pageTitle,
      description: pageDescription,
      isPartOf: { "@id": `${SITE_ORIGIN}/#website` },
      about: { "@id": `${SITE_ORIGIN}/#company-os` },
      publisher: { "@id": `${SITE_ORIGIN}/#organization` },
      inLanguage: "en",
      dateModified: "2026-09-04",
    },
    {
      "@type": "FAQPage",
      "@id": `${pageUrl}#faq`,
      mainEntity: [
        {
          "@type": "Question",
          name: "What is human approval for AI agents?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Human approval is a control that requires an authorized person to review and explicitly approve an AI-proposed action before a consequential operation is executed. The approval should be tied to a specific action, target, scope, and time window rather than acting as a blanket permission.",
          },
        },
        {
          "@type": "Question",
          name: "What is consequential authority in an AI workforce?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Consequential authority is the right to make or execute decisions that can materially affect people, money, legal obligations, security, external systems, or important company operations. In a governed AI workforce, that authority can remain with designated humans even when AI prepares the analysis or proposed action.",
          },
        },
        {
          "@type": "Question",
          name: "Should every AI agent action require human approval?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "No. Approval can be risk-based. Low-risk read or draft actions may run within defined permissions, while high-impact writes, external communications, financial actions, legal commitments, destructive operations, or other consequential actions can require explicit human approval.",
          },
        },
      ],
    },
  ],
};

export default function HumanApprovalAiAgentsPage() {
  return (
    <main className="knowledge-page">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }} />

      <nav className="public-breadcrumbs" aria-label="Breadcrumb">
        <Link href="/">RYTHM Company OS</Link><span aria-hidden="true">/</span><span aria-current="page">Human Approval for AI Agents</span>
      </nav>

      <section className="public-page-hero knowledge-hero">
        <div><p className="marketing-kicker">DIRECT ANSWER</p><h1>How should human approval work for consequential AI agent actions?</h1></div>
        <p>
          A governed AI system should separate proposing an action from having authority to execute it. When an action can materially affect people, money, legal obligations, security, external systems, or important company operations, the system can require an authorized human to review the proposal and grant explicit, action-specific approval before execution.
        </p>
      </section>

      <section className="marketing-section knowledge-section">
        <div className="marketing-section-heading"><p className="marketing-kicker">CONSEQUENTIAL AUTHORITY</p><h2>AI capability and organizational authority are different things.</h2><p>An AI role may be capable of analyzing a contract, preparing a payment, drafting an external message, or planning a system change without automatically receiving the authority to commit the company to that action.</p></div>
        <div className="knowledge-card-grid">
          <article><h3>Propose</h3><p>The AI prepares the recommendation, target, evidence, expected effect, and proposed action.</p></article>
          <article><h3>Evaluate policy</h3><p>Permissions, scope, risk, environment, and approval requirements are checked before execution.</p></article>
          <article><h3>Approve</h3><p>An authorized human can approve or reject the specific consequential action rather than granting open-ended authority.</p></article>
          <article><h3>Execute and verify</h3><p>Approved actions can be executed through governed integrations and recorded with their result and verification state.</p></article>
        </div>
      </section>

      <section className="marketing-section knowledge-section">
        <div className="marketing-section-heading"><p className="marketing-kicker">RISK-BASED CONTROL</p><h2>Not every action needs the same approval boundary.</h2></div>
        <div className="knowledge-card-grid">
          <article><h3>Low-risk work</h3><p>Reading permitted data, summarizing information, analyzing options, and preparing drafts can operate within defined role permissions.</p></article>
          <article><h3>High-impact writes</h3><p>Changing important records, sending external communications, publishing, deleting, or modifying production systems can require stronger controls.</p></article>
          <article><h3>Financial and legal effects</h3><p>Payments, purchases, contractual commitments, legal positions, and similar actions can remain subject to explicit human authority.</p></article>
          <article><h3>Security-sensitive actions</h3><p>Credential, access, permission, infrastructure, and security changes can use narrow scopes and mandatory approval where appropriate.</p></article>
        </div>
      </section>

      <section className="marketing-section knowledge-section">
        <div className="marketing-section-heading"><p className="marketing-kicker">RYTHM GOVERNANCE MODEL</p><h2>Human authority is part of the operating model, not an afterthought.</h2><p>RYTHM is designed around role permissions, risk boundaries, approval gates, traceable execution, and Human CEO authority. The purpose is not to force a human into every routine action; it is to preserve clear decision rights when AI work crosses a consequential boundary.</p></div>
      </section>

      <section className="marketing-cta knowledge-cta">
        <p className="marketing-kicker">GO DEEPER</p>
        <h2>See how governance fits into the wider AI company operating model.</h2>
        <div className="hero-actions">
          <Link className="marketing-button" href="/product-architecture">Review the product architecture</Link>
          <Link href="/how-it-works">See how RYTHM works</Link>
          <Link href="/ai-company-operating-system">Explore the AI company operating system</Link>
        </div>
        <p className="page-review-note">Reviewed and updated 2026-09-04.</p>
      </section>
    </main>
  );
}
