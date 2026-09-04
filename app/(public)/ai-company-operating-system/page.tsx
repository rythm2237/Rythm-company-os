import type { Metadata } from "next";
import Link from "next/link";
import { SITE_NAME, SITE_ORIGIN } from "@/lib/seo/site";

export const metadata: Metadata = {
  title: "AI Company Operating System | RYTHM Company OS",
  description:
    "Learn what an AI company operating system is, how it differs from ChatGPT, automation software, agent frameworks, and agent builders, and how RYTHM governs an AI workforce under Human CEO authority.",
  alternates: { canonical: "/ai-company-operating-system" },
  openGraph: {
    type: "website",
    url: "/ai-company-operating-system",
    siteName: SITE_NAME,
    title: "AI Company Operating System | RYTHM Company OS",
    description:
      "RYTHM is a governed AI company operating system for organizing AI roles, company context, decisions, approvals, and controlled execution under human authority.",
  },
};

const pageUrl = `${SITE_ORIGIN}/ai-company-operating-system`;

const structuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebPage",
      "@id": `${pageUrl}#webpage`,
      url: pageUrl,
      name: "AI Company Operating System",
      description:
        "Definition and comparison of an AI company operating system, with RYTHM Company OS as a governed AI workforce platform under Human CEO authority.",
      isPartOf: { "@id": `${SITE_ORIGIN}/#website` },
      about: { "@id": `${SITE_ORIGIN}/#company-os` },
      publisher: { "@id": `${SITE_ORIGIN}/#organization` },
      inLanguage: "en",
    },
    {
      "@type": "FAQPage",
      "@id": `${pageUrl}#faq`,
      mainEntity: [
        {
          "@type": "Question",
          name: "What is an AI company operating system?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "An AI company operating system is software that organizes multiple AI agents into business roles and connects their work to company context, reporting relationships, permissions, decisions, approvals, execution controls, and human authority.",
          },
        },
        {
          "@type": "Question",
          name: "How is an AI company operating system different from ChatGPT?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "ChatGPT is a general-purpose AI assistant centered on conversations. An AI company operating system adds persistent organizational roles, company context, multi-agent coordination, governance, approval boundaries, and traceable business execution.",
          },
        },
        {
          "@type": "Question",
          name: "How is an AI company operating system different from automation software?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Automation software primarily connects predefined triggers and actions. An AI company operating system also models organizational responsibility, AI reasoning and deliberation, risk policy, human decisions, approvals, and accountable execution.",
          },
        },
        {
          "@type": "Question",
          name: "Is RYTHM an agent framework like LangGraph or CrewAI?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "No. LangGraph and CrewAI are developer-oriented frameworks for building agent workflows. RYTHM Company OS is an operating product for organizing and governing an AI workforce inside a company structure under human authority.",
          },
        },
      ],
    },
  ],
};

export default function AiCompanyOperatingSystemPage() {
  return (
    <main>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }} />

      <section className="marketing-hero marketing-hero-compact">
        <div className="hero-copy">
          <p className="marketing-kicker">AI COMPANY OPERATING SYSTEM</p>
          <h1>What is an AI company operating system?</h1>
          <p>
            An AI company operating system is software for organizing AI agents as a governed business workforce—not simply a chatbot, workflow builder, or developer framework.
            It connects AI roles to company context, reporting relationships, permissions, meetings, decisions, approvals, execution controls, and accountable human authority.
          </p>
          <div className="hero-actions">
            <Link className="marketing-button marketing-button-large" href="/demo">Explore the RYTHM demo</Link>
            <Link href="/ai-workforce">Learn about AI workforce design</Link>
          </div>
        </div>
      </section>

      <section className="marketing-section how-section">
        <div className="marketing-section-heading">
          <p className="marketing-kicker">CATEGORY DEFINITION</p>
          <h2>RYTHM Company OS is a governed AI workforce platform and AI company operating system.</h2>
          <p>
            RYTHM is designed for founders and organizations that want multiple specialized AI Agents to work inside an explicit company model while consequential authority remains with a Human CEO or designated human decision-maker.
          </p>
        </div>
        <div className="how-grid">
          <article><span>01</span><h3>AI workforce</h3><p>Specialized AI Agents have defined business roles, responsibilities, reporting context, and explicit AI identity.</p></article>
          <article><span>02</span><h3>Company context</h3><p>Authorized organizational knowledge, objectives, projects, meetings, and decisions provide shared operating context.</p></article>
          <article><span>03</span><h3>Human governance</h3><p>Permissions, risk ceilings, policy checks, approval gates, and Human CEO authority constrain consequential actions.</p></article>
          <article><span>04</span><h3>Traceable execution</h3><p>Intent, deliberation, decisions, approvals, actions, verification, and outcomes remain connected as operating evidence.</p></article>
        </div>
      </section>

      <section className="marketing-section how-section">
        <div className="marketing-section-heading">
          <p className="marketing-kicker">HOW IT DIFFERS</p>
          <h2>RYTHM sits above individual models, agent frameworks, and workflow automation.</h2>
        </div>
        <div className="how-grid">
          <article><span>A</span><h3>ChatGPT and general AI assistants</h3><p>General assistants answer questions and help users perform work. RYTHM adds persistent organizational roles, company-wide context, multi-agent coordination, governance, and accountable execution.</p></article>
          <article><span>B</span><h3>n8n, Zapier, and automation software</h3><p>Automation tools are strong at connecting systems through triggers and workflows. RYTHM focuses on who is responsible, what an AI role may decide or propose, when a human must approve, and how execution is governed and traced.</p></article>
          <article><span>C</span><h3>LangGraph, CrewAI, and agent frameworks</h3><p>Agent frameworks give developers primitives for building agent systems. RYTHM is a business operating layer with company structure, AI roles, Human CEO authority, meetings, approvals, and controlled integrations.</p></article>
          <article><span>D</span><h3>Copilot Studio and ecosystem agent builders</h3><p>Agent builders create assistants and workflows inside their ecosystems. RYTHM is designed around the operating organization itself: departments, reporting relationships, company memory, decision rights, governance, and cross-system execution policy.</p></article>
        </div>
      </section>

      <section className="governance-section">
        <div>
          <p className="marketing-kicker">HUMAN-GOVERNED AI COMPANY</p>
          <h2>A virtual company with AI employees should not mean uncontrolled autonomy.</h2>
        </div>
        <ul>
          <li><strong>Human CEO remains the consequential authority</strong><span>AI Agents can analyze, deliberate, recommend, and perform bounded work, but high-impact decisions stay with humans.</span></li>
          <li><strong>Every Agent has a boundary</strong><span>Role, permissions, tools, risk, memory scope, and approval requirements constrain what each Agent can do.</span></li>
          <li><strong>External actions pass through policy</strong><span>Publishing, deployment, financial changes, messages, and other side effects require the configured authorization path.</span></li>
          <li><strong>Work remains attributable</strong><span>RYTHM preserves the chain from business intent through AI contribution, human decision, approval, action, and outcome.</span></li>
        </ul>
      </section>

      <section className="marketing-section">
        <div className="marketing-section-heading">
          <p className="marketing-kicker">RELATED EVIDENCE</p>
          <h2>Explore the operating model and compare adjacent platform categories.</h2>
        </div>
        <div className="hero-actions">
          <Link href="/how-it-works">How RYTHM works</Link>
          <Link href="/product-architecture">Product architecture</Link>
          <Link href="/compare">Platform comparisons</Link>
          <Link href="/research/governed-ai-workforce-benchmark">Governance benchmark</Link>
          <Link href="/ai-transparency">AI transparency</Link>
        </div>
      </section>
    </main>
  );
}
