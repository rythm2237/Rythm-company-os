import type { Metadata } from "next";
import Link from "next/link";
import { SITE_NAME, SITE_ORIGIN, SOCIAL_IMAGE_PATH } from "@/lib/seo/site";

const pageTitle = "AI Company Operating System vs ChatGPT and Automation";
const pageDescription =
  "A direct comparison of an AI company operating system with ChatGPT-style assistants and workflow automation, including when each operating model fits a business.";
const pageUrl = `${SITE_ORIGIN}/ai-company-operating-system-vs-chatgpt-automation`;

export const metadata: Metadata = {
  title: pageTitle,
  description: pageDescription,
  alternates: { canonical: "/ai-company-operating-system-vs-chatgpt-automation" },
  openGraph: {
    type: "website",
    url: "/ai-company-operating-system-vs-chatgpt-automation",
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
          name: "How is an AI company operating system different from ChatGPT?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "A conversational assistant primarily responds inside a chat session. An AI company operating system coordinates persistent roles, organizational context, permissions, meetings, approvals, decision rights, execution, and audit records across ongoing business work.",
          },
        },
        {
          "@type": "Question",
          name: "How is an AI company operating system different from workflow automation?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Workflow automation is usually organized around triggers, steps, integrations, and deterministic execution paths. An AI company operating system is organized around accountable roles, company context, collaboration, authority, policy, approvals, and governed execution, while automation can operate underneath that model.",
          },
        },
        {
          "@type": "Question",
          name: "Can a business use ChatGPT, automation, and an AI company operating system together?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Yes. Conversational AI can support individual reasoning, automation can connect systems and execute workflows, and an AI company operating system can provide the organizational and governance layer that coordinates persistent AI roles and human authority.",
          },
        },
      ],
    },
  ],
};

export default function AiCompanyOsVsChatgptAutomationPage() {
  return (
    <main className="knowledge-page">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }} />

      <nav className="public-breadcrumbs" aria-label="Breadcrumb">
        <Link href="/">RYTHM Company OS</Link><span aria-hidden="true">/</span><span aria-current="page">Company OS vs ChatGPT and Automation</span>
      </nav>

      <section className="public-page-hero knowledge-hero">
        <div><p className="marketing-kicker">DIRECT ANSWER</p><h1>How is an AI company operating system different from ChatGPT or workflow automation?</h1></div>
        <p>
          Chat-based AI helps a person reason or create through a conversation. Workflow automation connects triggers, logic, and actions. An AI company operating system adds a persistent organizational layer: specialized AI roles, shared company context, reporting relationships, meetings, permissions, human decision rights, approvals, and governed execution.
        </p>
      </section>

      <section className="marketing-section knowledge-section">
        <div className="marketing-section-heading"><p className="marketing-kicker">THREE OPERATING MODELS</p><h2>The difference is what the product treats as the center of work.</h2></div>
        <div className="knowledge-card-grid">
          <article><h3>Chat assistant</h3><p>The center is a conversation between a user and an AI. It is useful for questions, drafting, analysis, and interactive assistance.</p></article>
          <article><h3>Workflow automation</h3><p>The center is a workflow: triggers, integrations, logic, data movement, actions, and execution paths.</p></article>
          <article><h3>AI company operating system</h3><p>The center is the organization: roles, departments, responsibilities, company memory, authority, collaboration, approvals, and accountable work.</p></article>
        </div>
      </section>

      <section className="marketing-section knowledge-section">
        <div className="marketing-section-heading"><p className="marketing-kicker">WHEN RYTHM FITS</p><h2>Use an organizational operating layer when AI work must persist beyond a prompt or workflow.</h2></div>
        <div className="knowledge-card-grid">
          <article><h3>Persistent responsibilities</h3><p>AI roles can be attached to continuing responsibilities rather than recreated as isolated prompts each time.</p></article>
          <article><h3>Shared company context</h3><p>Work can be grounded in common organizational knowledge instead of relying only on the context of one conversation.</p></article>
          <article><h3>Human authority</h3><p>Consequential decisions and actions can remain subject to explicit human approval and role-based authority.</p></article>
          <article><h3>Governed execution</h3><p>Permissions, risk, approvals, execution records, verification, and auditability can be treated as part of the operating model.</p></article>
        </div>
      </section>

      <section className="marketing-section knowledge-section">
        <div className="marketing-section-heading"><p className="marketing-kicker">NOT MUTUALLY EXCLUSIVE</p><h2>These layers can complement each other.</h2><p>RYTHM does not require a business to choose one technology category for every problem. A conversational model can assist a role, an automation platform can execute integrations, and the company operating system can define who is allowed to do what, under which context and approval boundary.</p></div>
      </section>

      <section className="marketing-cta knowledge-cta">
        <p className="marketing-kicker">EXPLORE THE MODEL</p>
        <h2>Compare the organizational layer with the underlying tools.</h2>
        <div className="hero-actions">
          <Link className="marketing-button" href="/ai-company-operating-system">What is an AI company operating system?</Link>
          <Link href="/ai-workforce-software">Compare AI workforce software categories</Link>
          <Link href="/compare">View platform comparisons</Link>
        </div>
        <p className="page-review-note">Reviewed and updated 2026-09-04.</p>
      </section>
    </main>
  );
}
