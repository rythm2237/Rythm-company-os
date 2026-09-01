import type { Metadata } from "next";
import Link from "next/link";
import PublicPageStructuredData from "@/components/brand/PublicPageStructuredData";
import { createPublicMetadata } from "@/lib/seo/site";

export const metadata: Metadata = createPublicMetadata("/security");

export default function SecurityPage() {
  const securityEmail = "security@rythm-os.com";

  return (
    <>
      <PublicPageStructuredData
        breadcrumbLabel="Security"
        dateModified="2026-09-01"
        description="Review the current RYTHM Company OS Public Beta security posture for identity, tenant-aware data access, AI governance, and responsible security reporting."
        name="RYTHM Company OS Security"
        path="/security"
      />
      <main>
      <section className="public-page-hero enterprise-hero">
        <div><p className="marketing-kicker">SECURITY</p><h1>Security is enforced through identity, tenant boundaries, entitlements, and governed actions.</h1></div>
        <p>This page describes the current Public Beta security posture. It is a technical overview, not a certification or contractual security schedule. Reviewed 1 September 2026.</p>
      </section>

      <section className="marketing-section enterprise-model">
        <div className="enterprise-capabilities"><p className="marketing-kicker">ACCESS CONTROL</p><h2>Authenticated and organization-scoped.</h2><ul><li>Supabase Authentication protects customer access.</li><li>Organization membership is validated before protected workspace access.</li><li>Owner-only management paths enforce role-aware checks.</li><li>Password recovery uses single-use authentication links and PKCE session exchange.</li></ul></div>
        <div className="enterprise-capabilities"><p className="marketing-kicker">DATA ACCESS</p><h2>Tenant-aware database enforcement.</h2><ul><li>Row Level Security policies scope supported data access to the active organization.</li><li>Commercial catalog writes are restricted and governed mutations are server-controlled.</li><li>Pending commercial entitlements cannot use activated product capabilities.</li><li>The public Demo uses synthetic fixtures and does not expose production tenant data.</li></ul></div>
      </section>

      <section className="marketing-section enterprise-model">
        <div className="enterprise-capabilities"><p className="marketing-kicker">EXECUTION SECURITY</p><h2>Tool use is separated from model output.</h2><ul><li>Supported actions pass through a centralized Integration and Execution Gateway.</li><li>Capability, scope, Agent permission, user permission, entitlement, environment, risk and approval are evaluated separately.</li><li>Execution requests use tenant-scoped records and idempotency controls where the operation supports them.</li><li>High-impact actions require an exact, bounded human approval rather than a reusable blanket approval.</li></ul></div>
        <div className="enterprise-capabilities"><p className="marketing-kicker">CONTROL OWNERSHIP</p><h2>Current controls are operated by the RYTHM Public Beta provider.</h2><ul><li>RYTHM operates application authorization, gateway policy, tenant-aware data controls and the documented incident channel.</li><li>Infrastructure subprocessors operate their respective hosting, database, AI or communication services as disclosed in the Subprocessor Register.</li><li>Customers remain responsible for authorized users, submitted data, connected accounts, local legal requirements and their own deployment decisions.</li><li>Enterprise customers should request a control and data-flow review before sensitive deployment.</li></ul></div>
      </section>

      <section className="marketing-section knowledge-faq">
        <div className="marketing-section-heading"><p className="marketing-kicker">SECURITY QUESTIONS</p><h2>Material Public Beta answers</h2></div>
        <div className="knowledge-answer-list">
          <article><h3>Is RYTHM SOC 2 or ISO 27001 certified?</h3><p>No. RYTHM does not currently claim SOC 2, ISO 27001, or another third-party security certification.</p></article>
          <article><h3>Where is tenant isolation enforced?</h3><p>Tenant boundaries use authenticated organization context, application checks, Supabase Row Level Security, and organization-scoped execution and operating records.</p></article>
          <article><h3>Can an Agent access every connected tool?</h3><p>No. A connection does not grant universal access. Provider scope, organization grant, Agent capability, user permission, risk, approval and rollout state are checked separately.</p></article>
          <article><h3>How should a vulnerability be reported?</h3><p>Send the affected URL, reproduction steps, expected behavior and observed behavior to security@rythm-os.com. Do not include secrets or unrelated customer data in the initial report.</p></article>
        </div>
      </section>

      <section className="marketing-section enterprise-model">
        <div className="enterprise-capabilities"><p className="marketing-kicker">AI GOVERNANCE</p><h2>AI authority is bounded by product controls.</h2><ul><li>Agent roles include authority and risk boundaries.</li><li>External actions remain locked by default in the Public Beta.</li><li>Approval-requiring work is designed to stop at a human decision boundary.</li><li>Traceability links intent, evidence, meetings, decisions, approvals, and actions.</li></ul></div>
        <div className="enterprise-capabilities"><p className="marketing-kicker">CURRENT LIMITS</p><h2>Public Beta is not a security certification.</h2><ul><li>No SOC 2 or ISO 27001 certification is currently claimed.</li><li>Enterprise use should undergo customer-specific security and data review.</li><li>Do not treat the public Demo as a place for confidential or production information.</li><li>Security controls and documentation may be strengthened during the Beta.</li></ul></div>
      </section>

      <section className="enterprise-contact-section">
        <div><p className="marketing-kicker">SECURITY REPORTING</p><h2>Found a security issue?</h2><p>Do not include passwords, access tokens, private keys, or unrelated customer data in an initial report. Provide the affected URL, reproduction steps, expected behavior, and observed behavior.</p></div>
        <div className="enterprise-contact-card"><h3>Report responsibly</h3><a className="marketing-button" href={`mailto:${securityEmail}?subject=${encodeURIComponent("RYTHM security report")}`}>Email Security</a><p className="contact-notice">{securityEmail}</p><div className="hero-actions"><Link href="/trust">Trust Center</Link><Link href="/legal">Legal Notice</Link></div></div>
      </section>
      </main>
    </>
  );
}
