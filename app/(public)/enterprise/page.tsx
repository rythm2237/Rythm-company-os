import type { Metadata } from "next";
import Link from "next/link";
import PublicPageStructuredData from "@/components/brand/PublicPageStructuredData";
import { getCommercialCatalog } from "@/lib/commercial/catalog";
import { createPublicMetadata } from "@/lib/seo/site";
import { submitEnterpriseIntake } from "./actions";

export const metadata: Metadata = createPublicMetadata("/enterprise");

type Props = {
  searchParams: Promise<{
    offer?: string;
    submitted?: string;
    qualification?: string;
    intake_error?: string;
  }>;
};

export const dynamic = "force-dynamic";

export default async function EnterprisePage({ searchParams }: Props) {
  const params = await searchParams;
  const requestedCode = params.offer;
  const offers = await getCommercialCatalog();
  const requestedOffer = offers.find((offer) => offer.offer_code === requestedCode);
  const liveMeetingRequested = requestedCode === "live_ai_meeting";
  const inquiryName = liveMeetingRequested ? "Live AI Meeting Beta" : requestedOffer?.name ?? "Enterprise AI Workforce";
  const submitted = params.submitted === "1";
  const qualified = params.qualification === "marketing_qualified";
  const intakeError = params.intake_error === "1";

  return (
    <>
      <PublicPageStructuredData
        breadcrumbLabel="Enterprise AI Workforce"
        dateModified="2026-09-03"
        description="Plan governed AI teams across departments, human managers, AI roles, knowledge boundaries, integrations, approvals, auditability, and executive oversight."
        name="Enterprise AI Workforce"
        path="/enterprise"
      />
      <main>
      <section className="public-page-hero enterprise-hero">
        <div><p className="marketing-kicker">ENTERPRISE AI WORKFORCE</p><h1>Deploy governed AI teams inside the organization you already have.</h1></div>
        <p>Combine human leadership, AI managers and specialists, departmental knowledge, approval boundaries, auditability, and executive oversight through a controlled Enterprise Beta.</p>
      </section>
      <section className="marketing-section enterprise-model">
        <div className="enterprise-hierarchy" aria-label="Example Enterprise AI workforce hierarchy">
          <div className="is-human"><span>HUMAN</span><strong>Integration Director</strong><small>Final departmental authority</small></div>
          <i aria-hidden="true" />
          <div><span>AI MANAGER</span><strong>Program Manager</strong><small>Governed coordination</small></div>
          <i aria-hidden="true" />
          <section><div><span>AI ROLE</span><strong>Process Analyst</strong></div><div><span>AI ROLE</span><strong>Automation Specialist</strong></div><div><span>AI ROLE</span><strong>Data Analyst</strong></div><div><span>AI ROLE</span><strong>Research Agent</strong></div></section>
        </div>
        <div className="enterprise-capabilities"><p className="marketing-kicker">BETA DIRECTION</p><h2>Enterprise starts with governance architecture, not instant checkout.</h2><ul><li>Department and workforce discovery</li><li>Human manager and AI manager design</li><li>Knowledge and permission boundaries</li><li>Advanced governance and audit planning</li><li>Controlled rollout and executive review</li></ul></div>
      </section>
      <section className="marketing-section enterprise-model">
        <div className="enterprise-capabilities"><p className="marketing-kicker">IMPLEMENTATION PATH</p><h2>Move from discovery to a controlled production boundary.</h2><ul><li>Define business objectives, accountable executives and the initial departmental scope.</li><li>Map roles, knowledge, data sensitivity, connected systems, decision rights and prohibited actions.</li><li>Validate a bounded pilot with acceptance criteria, security review, telemetry and rollback.</li><li>Expand only after evidence supports the next capability, department or execution mode.</li></ul></div>
        <div className="enterprise-capabilities"><p className="marketing-kicker">PROCUREMENT EVIDENCE</p><h2>Review current facts before contract or deployment.</h2><ul><li>Public Beta status, service provider identity, security posture, subprocessors and data-processing terms are published.</li><li>RYTHM does not currently claim SOC 2 or ISO 27001 certification.</li><li>Integration availability and provider-specific scopes must be verified for the proposed deployment.</li><li>Customer-specific requirements belong in the signed order, security review and implementation plan.</li></ul></div>
      </section>

      <section className="marketing-section knowledge-faq">
        <div className="marketing-section-heading"><p className="marketing-kicker">ENTERPRISE QUESTIONS</p><h2>Deployment and governance answers</h2></div>
        <div className="knowledge-answer-list">
          <article><h3>How long does implementation take?</h3><p>RYTHM does not publish a universal implementation duration. Timing depends on scope, integrations, data, security review, role design, pilot evidence and customer decision speed.</p></article>
          <article><h3>Can RYTHM work alongside human departments?</h3><p>Yes. The Enterprise model is designed for AI roles and managers to operate within explicit departmental and human-management boundaries.</p></article>
          <article><h3>Can enterprise customers create custom Agents?</h3><p>Custom capacity and role design can be part of the Enterprise scope, subject to the agreed governance, entitlement and implementation boundary.</p></article>
          <article><h3>What happens before production execution?</h3><p>The proposed capability is reviewed for scope, data, permissions, risk, approval, provider readiness, telemetry, verification and rollback before controlled activation.</p></article>
        </div>
      </section>
      <section className="enterprise-contact-section">
        <div><p className="marketing-kicker">{liveMeetingRequested ? "LIVE AI MEETING BETA" : "CONTROLLED BETA INTAKE"}</p><h2>{liveMeetingRequested ? "Bring a real business objective into a governed RYTHM meeting." : "Plan the workforce and controls before deployment."}</h2><p>{requestedOffer ? `You selected ${requestedOffer.name}. ${requestedOffer.summary}` : liveMeetingRequested ? "The paid meeting price and resource limits will be supplied by the commercial catalog before checkout opens." : "Enterprise onboarding and assisted implementations are reviewed manually during Public Beta."}</p></div>
        <div className="enterprise-contact-card">
          <h3>{inquiryName}</h3>
          {submitted ? (
            <div className="security-note" role="status">
              <strong>Enterprise intake received.</strong>
              <p>{qualified ? "Your submitted company context meets the current Enterprise Beta marketing-qualification boundary. RYTHM can now treat this as a qualified lead outcome for first-party attribution reporting." : "Your inquiry is recorded for review. It is not counted as a qualified Enterprise lead in attribution reporting unless the qualification boundary is met."}</p>
            </div>
          ) : (
            <form action={submitEnterpriseIntake} className="auth-form">
              <input name="website" type="text" tabIndex={-1} autoComplete="off" aria-hidden="true" style={{ position: "absolute", left: "-9999px" }} />
              <label>Full name<input name="fullName" required minLength={2} maxLength={120} autoComplete="name" /></label>
              <label>Work email<input name="workEmail" required type="email" maxLength={200} autoComplete="email" /></label>
              <label>Company<input name="companyName" required minLength={2} maxLength={160} autoComplete="organization" /></label>
              <label>Job title<input name="jobTitle" required minLength={2} maxLength={120} autoComplete="organization-title" /></label>
              <label>Company size<select name="companySize" required defaultValue=""><option value="" disabled>Select company size</option><option value="1_49">1–49 employees</option><option value="50_199">50–199 employees</option><option value="200_999">200–999 employees</option><option value="1000_plus">1,000+ employees</option></select></label>
              <label>Deployment horizon<select name="timeline" required defaultValue=""><option value="" disabled>Select horizon</option><option value="0_3m">0–3 months</option><option value="3_6m">3–6 months</option><option value="6_12m">6–12 months</option><option value="12m_plus">12+ months</option><option value="exploring">Exploring / no active timeline</option></select></label>
              <label>Your role in the decision<select name="decisionRole" required defaultValue=""><option value="" disabled>Select responsibility</option><option value="decision_maker">Decision maker</option><option value="executive_sponsor">Executive sponsor</option><option value="evaluator">Evaluator / implementation team</option><option value="researcher">Researching options</option></select></label>
              <label>Primary use case<select name="useCase" required defaultValue=""><option value="" disabled>Select use case</option><option value="operations">Operations</option><option value="customer_support">Customer support</option><option value="sales_marketing">Sales &amp; marketing</option><option value="research_analysis">Research &amp; analysis</option><option value="software_delivery">Software delivery</option><option value="other">Other governed AI workforce use case</option></select></label>
              <label style={{ display: "flex", gap: 10, alignItems: "flex-start" }}><input name="consent" type="checkbox" value="yes" required style={{ width: "auto", marginTop: 3 }} /><span>I agree that RYTHM may store these details for Enterprise Beta evaluation and contact me about this inquiry. Referral attribution is reported separately without my identity.</span></label>
              {intakeError ? <p className="form-error" role="alert">The intake could not be submitted. Check all required fields and try again.</p> : null}
              <button type="submit">Submit Enterprise intake</button>
            </form>
          )}
          <p className="security-note">A qualified attribution outcome is recorded only when server-side criteria indicate an active Enterprise deployment: a non-consumer work email, 50+ employee company, deployment horizon within six months, and decision-maker or executive-sponsor responsibility.</p>
          <div className="hero-actions"><Link href={liveMeetingRequested ? "/live-ai-meeting" : "/pricing"}>Review product details</Link><Link href="/signup">Create an account</Link></div>
        </div>
      </section>
      </main>
    </>
  );
}
