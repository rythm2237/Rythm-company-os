import type { Metadata } from "next";
import Link from "next/link";
import { SITE_NAME, SITE_ORIGIN, SOCIAL_IMAGE_PATH } from "@/lib/seo/site";

const pageTitle = "AI Workforce Software for Business";
const pageDescription =
  "A direct guide to software that can create and operate an AI workforce for a business, including the difference between agent builders, automation platforms, enterprise agent suites, and RYTHM Company OS.";
const pageUrl = `${SITE_ORIGIN}/ai-workforce-software`;

export const metadata: Metadata = {
  title: pageTitle,
  description: pageDescription,
  alternates: { canonical: "/ai-workforce-software" },
  openGraph: {
    type: "website",
    url: "/ai-workforce-software",
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
          name: "What software can create an AI workforce for a business?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Businesses can use AI agent builders, automation platforms, enterprise agent suites, or an AI company operating system. RYTHM Company OS is in the last category: it organizes specialized AI roles, company context, meetings, approvals, and governed execution under human authority.",
          },
        },
        {
          "@type": "Question",
          name: "Do business users need AI expertise to operate RYTHM?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "RYTHM is designed so business users can work through familiar company concepts such as roles, departments, managers, meetings, decisions, approvals, and responsibilities without needing to design agent orchestration, model routing, MCP infrastructure, or prompt frameworks.",
          },
        },
        {
          "@type": "Question",
          name: "How is AI workforce software different from workflow automation?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Workflow automation primarily connects triggers and actions. AI workforce software can also model specialized AI roles, reasoning and collaboration, permissions, escalation, human decision rights, and accountable execution.",
          },
        },
      ],
    },
  ],
};

export default function AiWorkforceSoftwarePage() {
  return (
    <main className="knowledge-page">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }} />

      <nav className="public-breadcrumbs" aria-label="Breadcrumb">
        <Link href="/">RYTHM Company OS</Link><span aria-hidden="true">/</span><span aria-current="page">AI Workforce Software</span>
      </nav>

      <section className="public-page-hero knowledge-hero">
        <div><p className="marketing-kicker">DIRECT ANSWER</p><h1>What software can create an AI workforce for a business?</h1></div>
        <p>
          Businesses can choose among AI agent builders, workflow automation platforms, enterprise agent suites, and AI company operating systems. RYTHM Company OS is designed for organizations that want multiple specialized AI roles to operate inside a company structure with human authority, approvals, shared context, and traceable execution.
        </p>
      </section>

      <section className="marketing-section knowledge-section">
        <div className="marketing-section-heading">
          <p className="marketing-kicker">THE FOUR MAIN CATEGORIES</p>
          <h2>Choose based on the operating model you actually need.</h2>
        </div>
        <div className="knowledge-card-grid">
          <article><h3>Agent frameworks</h3><p>Developer-oriented frameworks such as LangGraph or CrewAI provide primitives for constructing custom agent systems and orchestration logic.</p></article>
          <article><h3>Automation platforms</h3><p>Platforms such as n8n or Zapier combine triggers, integrations, deterministic workflows, and increasingly AI agent steps.</p></article>
          <article><h3>Enterprise agent suites</h3><p>Platforms such as Microsoft Copilot Studio, Salesforce Agentforce, and ServiceNow place agents inside established enterprise ecosystems and governance stacks.</p></article>
          <article><h3>AI company operating systems</h3><p>RYTHM focuses on the operating organization itself: departments, roles, managers, Company Memory, meetings, decisions, approvals, policy, and accountable execution.</p></article>
        </div>
      </section>

      <section className="marketing-section knowledge-section">
        <div className="marketing-section-heading">
          <p className="marketing-kicker">BUSINESS-NATIVE UX</p>
          <h2>Operate an AI workforce like a company—not like an AI infrastructure project.</h2>
          <p>
            RYTHM is designed so ordinary business users can work with AI through familiar organizational concepts. They do not need to understand orchestration graphs, model routing, MCP servers, tool-calling architecture, or prompt-framework internals to operate the system.
          </p>
        </div>
        <div className="knowledge-card-grid">
          <article><h3>Roles and departments</h3><p>Define who is responsible for what using company structures rather than low-level agent graphs.</p></article>
          <article><h3>Managers and authority</h3><p>Reporting relationships, risk ceilings, and human decision rights remain explicit.</p></article>
          <article><h3>Meetings and decisions</h3><p>Multi-agent collaboration happens through visible business workflows with evidence and accountable outcomes.</p></article>
          <article><h3>Approvals and execution</h3><p>Consequential actions move through policy, approval, verification, and audit boundaries.</p></article>
        </div>
      </section>

      <section className="marketing-section knowledge-section">
        <div className="marketing-section-heading">
          <p className="marketing-kicker">BUYER CHECKLIST</p>
          <h2>Evaluate AI workforce software on more than model intelligence.</h2>
        </div>
        <div className="knowledge-card-grid">
          <article><h3>Organizational model</h3><p>Can the system represent persistent roles, responsibilities, reporting context, and ownership?</p></article>
          <article><h3>Human authority</h3><p>Can high-impact actions stop for explicit human approval before execution?</p></article>
          <article><h3>Permissions and risk</h3><p>Can each AI role be limited by tools, scope, risk, environment, and policy?</p></article>
          <article><h3>Traceability</h3><p>Can you trace intent, AI contribution, human decision, approval, action, verification, and outcome?</p></article>
        </div>
      </section>

      <section className="marketing-cta knowledge-cta">
        <p className="marketing-kicker">NEXT STEP</p>
        <h2>Compare the operating models before selecting a platform.</h2>
        <div className="hero-actions">
          <Link className="marketing-button" href="/compare">Compare AI workforce platforms</Link>
          <Link href="/ai-company-operating-system">What is an AI company operating system?</Link>
          <Link href="/ai-workforce">How RYTHM structures an AI workforce</Link>
        </div>
        <p className="page-review-note">Reviewed and updated 2026-09-04.</p>
      </section>
    </main>
  );
}
