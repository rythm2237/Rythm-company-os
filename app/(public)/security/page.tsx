import type { Metadata } from "next";
import Link from "next/link";
import { createPublicMetadata } from "@/lib/seo/site";

export const metadata: Metadata = createPublicMetadata("/security");

export default function SecurityPage() {
  const securityEmail = process.env.NEXT_PUBLIC_SECURITY_EMAIL;

  return (
    <main>
      <section className="public-page-hero enterprise-hero">
        <div><p className="marketing-kicker">SECURITY</p><h1>Security is enforced through identity, tenant boundaries, entitlements, and governed actions.</h1></div>
        <p>This page describes the current Public Beta security posture. It is a technical overview, not a certification or contractual security schedule.</p>
      </section>

      <section className="marketing-section enterprise-model">
        <div className="enterprise-capabilities"><p className="marketing-kicker">ACCESS CONTROL</p><h2>Authenticated and organization-scoped.</h2><ul><li>Supabase Authentication protects customer access.</li><li>Organization membership is validated before protected workspace access.</li><li>Owner-only management paths enforce role-aware checks.</li><li>Password recovery uses single-use authentication links and PKCE session exchange.</li></ul></div>
        <div className="enterprise-capabilities"><p className="marketing-kicker">DATA ACCESS</p><h2>Tenant-aware database enforcement.</h2><ul><li>Row Level Security policies scope supported data access to the active organization.</li><li>Commercial catalog writes are restricted and governed mutations are server-controlled.</li><li>Pending commercial entitlements cannot use activated product capabilities.</li><li>The public Demo uses synthetic fixtures and does not expose production tenant data.</li></ul></div>
      </section>

      <section className="marketing-section enterprise-model">
        <div className="enterprise-capabilities"><p className="marketing-kicker">AI GOVERNANCE</p><h2>AI authority is bounded by product controls.</h2><ul><li>Agent roles include authority and risk boundaries.</li><li>External actions remain locked by default in the Public Beta.</li><li>Approval-requiring work is designed to stop at a human decision boundary.</li><li>Traceability links intent, evidence, meetings, decisions, approvals, and actions.</li></ul></div>
        <div className="enterprise-capabilities"><p className="marketing-kicker">CURRENT LIMITS</p><h2>Public Beta is not a security certification.</h2><ul><li>No SOC 2 or ISO 27001 certification is currently claimed.</li><li>Enterprise use should undergo customer-specific security and data review.</li><li>Do not treat the public Demo as a place for confidential or production information.</li><li>Security controls and documentation may be strengthened during the Beta.</li></ul></div>
      </section>

      <section className="enterprise-contact-section">
        <div><p className="marketing-kicker">SECURITY REPORTING</p><h2>Found a security issue?</h2><p>Do not include passwords, access tokens, private keys, or unrelated customer data in an initial report. Provide the affected URL, reproduction steps, expected behavior, and observed behavior.</p></div>
        <div className="enterprise-contact-card"><h3>Report responsibly</h3>{securityEmail ? <a className="marketing-button" href={`mailto:${securityEmail}?subject=${encodeURIComponent("RYTHM security report")}`}>Email Security</a> : <p className="contact-notice">A dedicated security mailbox is not yet published. Use the controlled Enterprise contact path and identify the message as a security report.</p>}<div className="hero-actions"><Link href="/enterprise">Contact RYTHM</Link><Link href="/trust">Trust Center</Link></div></div>
      </section>
    </main>
  );
}
