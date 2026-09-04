import type { Metadata } from "next";
import Link from "next/link";
import { createPublicMetadata } from "@/lib/seo/site";

export const metadata: Metadata = createPublicMetadata("/ai-transparency");

export default function AiTransparencyPage() {
  return (
    <main>
      <section className="public-page-hero enterprise-hero">
        <div><p className="marketing-kicker">AI TRANSPARENCY</p><h1>What RYTHM AI does, what data it can use, and where human authority remains mandatory.</h1></div>
        <p>Effective 14 August 2026. RYTHM Company OS uses clearly identified AI Agents and AI-assisted workflows for analysis, drafting, meetings, recommendations, and structured operational support. AI output is not presented as an undisclosed human decision.</p>
      </section>

      <section className="marketing-section enterprise-model">
        <div className="enterprise-capabilities"><p className="marketing-kicker">WHAT IS AI</p><h2>AI participation is explicit.</h2><ul><li>Named AI Agents can generate analyses, recommendations, plans, drafts, and meeting contributions.</li><li>Meeting summarization and governed deliberation can use AI to process authorized meeting context.</li><li>Legal-review features are issue-spotting and escalation aids, not autonomous legal determinations.</li><li>The public Demo is synthetic and read-only and is designed to demonstrate AI-company workflows without real customer production actions.</li></ul></div>
        <div className="enterprise-capabilities"><p className="marketing-kicker">HUMAN AUTHORITY</p><h2>Consequential authority remains with humans.</h2><ul><li>The Human CEO remains the final authority for consequential company decisions in the current Public Beta governance model.</li><li>AI Agents operate within defined roles, authority levels, risk ceilings, and approval boundaries.</li><li>Recommendations are not silently converted into consequential external actions.</li><li>AI output should be reviewed by an appropriately qualified human when business, legal, financial, safety, employment, or other significant consequences are involved.</li></ul><p><Link href="/human-approval-ai-agents">Read the direct guide to human approval and consequential authority for AI agents.</Link></p></div>
      </section>

      <section className="marketing-section enterprise-model">
        <div className="enterprise-capabilities"><p className="marketing-kicker">MODEL DATA</p><h2>Only relevant authorized context should be sent for inference.</h2><ul><li>An AI invocation can include the user's prompt, agent role/instructions, meeting purpose, agenda, decision question, relevant transcript excerpts, and other authorized workspace context needed for the requested task.</li><li>Current audited Public Beta AI inference uses OpenAI as the model provider when an AI feature is invoked.</li><li>RYTHM should not intentionally send passwords, session tokens, API keys, service-role credentials, unrelated personal data, or another tenant's information to a model.</li><li>Special-category, highly sensitive, or separately regulated data requires deployment-specific review before intentional AI processing.</li></ul></div>
        <div className="enterprise-capabilities"><p className="marketing-kicker">PRIVACY</p><h2>AI processing follows the same privacy and tenant boundaries as the service.</h2><ul><li>OpenAI is disclosed in the current <Link href="/subprocessors">Subprocessor Register</Link>.</li><li>The <Link href="/privacy">Privacy Policy</Link> explains AI-related personal-data processing.</li><li>Where RYTHM acts as a processor for customer personal data, the <Link href="/dpa">DPA</Link> applies unless a signed agreement replaces it.</li><li>RYTHM does not claim zero provider retention, EEA-only model processing, or provider no-training guarantees unless the applicable contracted configuration has been verified.</li></ul></div>
      </section>

      <section className="marketing-section enterprise-model">
        <div className="enterprise-capabilities"><p className="marketing-kicker">NOT APPROVED BY DEFAULT</p><h2>Some AI uses require a separate legal, privacy, and risk review.</h2><ul><li>Autonomous hiring, firing, promotion, worker scoring or worker-management decisions.</li><li>Creditworthiness, insurance, education-access, essential-service, medical, biometric, law-enforcement, migration, justice, or safety-critical determinations.</li><li>Manipulative, deceptive, exploitative, social-scoring, or other prohibited practices under applicable law.</li><li>Any workflow that removes required human review from a consequential decision.</li></ul></div>
        <div className="enterprise-capabilities"><p className="marketing-kicker">LIMITATIONS</p><h2>AI output can be wrong.</h2><ul><li>Generative AI can produce incomplete, inaccurate, outdated, fabricated, or contextually unsuitable output.</li><li>Confidence, fluency, or formatting does not establish factual correctness.</li><li>Customers are responsible for selecting appropriate human reviewers and lawful use cases.</li><li>Security, privacy, model, and regulatory controls are reviewed as the Public Beta evolves.</li></ul></div>
      </section>

      <section className="marketing-section knowledge-section" aria-labelledby="ai-operating-model-context">
        <div className="marketing-section-heading">
          <p className="marketing-kicker">OPERATING MODEL CONTEXT</p>
          <h2 id="ai-operating-model-context">Understand where the governance layer sits relative to chat and automation.</h2>
          <p>
            Conversational AI, workflow automation, and an AI company operating system solve different layers of the problem. RYTHM's governance model is designed around persistent roles, human decision rights, and controlled execution rather than treating every AI interaction as a standalone chat or workflow.
          </p>
        </div>
        <div className="hero-actions">
          <Link href="/ai-company-operating-system-vs-chatgpt-automation">Compare AI Company OS, ChatGPT, and automation</Link>
          <Link href="/product-architecture">Review the product architecture</Link>
        </div>
      </section>

      <section className="enterprise-contact-section"><div><p className="marketing-kicker">AI GOVERNANCE REVIEW</p><h2>Planning a regulated or consequential AI workflow?</h2><p>Request a deployment-specific review before enabling the workflow in Production.</p></div><div className="enterprise-contact-card"><h3>Governance resources</h3><a className="marketing-button" href="mailto:legal@rythm-os.com?subject=AI%20governance%20review">Request review</a><div className="hero-actions"><Link href="/trust">Trust Center</Link><Link href="/security">Security</Link><Link href="/privacy">Privacy</Link></div></div></section>
    </main>
  );
}
