import type { Metadata } from "next";
import Link from "next/link";
import { createPublicMetadata } from "@/lib/seo/site";

export const metadata: Metadata = createPublicMetadata("/trust");

export default function TrustPage() {
  return (
    <main>
      <section className="public-page-hero enterprise-hero">
        <div>
          <p className="marketing-kicker">RYTHM TRUST CENTER</p>
          <h1>Governance, security boundaries, and human authority are part of the product.</h1>
        </div>
        <p>
          RYTHM Company OS is designed so AI work remains organization-scoped, reviewable, traceable,
          and bounded by explicit human authority. This page describes the controls currently used in the Public Beta.
        </p>
      </section>

      <section className="marketing-section enterprise-model">
        <div className="enterprise-capabilities">
          <p className="marketing-kicker">HUMAN AUTHORITY</p>
          <h2>Consequential authority stays with the Human CEO.</h2>
          <ul>
            <li>AI Agents operate within defined roles, authority levels, and risk ceilings.</li>
            <li>Approval boundaries separate recommendations from consequential actions.</li>
            <li>External actions are disabled by default in the Public Beta unless explicitly enabled by governed product logic.</li>
            <li>Decision, approval, and action history is designed to remain attributable and reviewable.</li>
          </ul>
        </div>
        <div className="enterprise-capabilities">
          <p className="marketing-kicker">TENANT BOUNDARY</p>
          <h2>Organizations are isolated by application and database controls.</h2>
          <ul>
            <li>Authenticated access is scoped to validated organization membership.</li>
            <li>Supabase Row Level Security is used to enforce tenant-aware data access.</li>
            <li>Commercial entitlements gate product capabilities and governed mutations.</li>
            <li>Public Demo data is synthetic, read-only, and separate from customer organizations.</li>
          </ul>
        </div>
      </section>

      <section className="marketing-section enterprise-model">
        <div className="enterprise-capabilities">
          <p className="marketing-kicker">IDENTITY & ACCESS</p>
          <h2>Account flows use verified authentication paths.</h2>
          <ul>
            <li>Email confirmation is required for new email/password accounts.</li>
            <li>Password recovery uses a one-time browser-bound PKCE flow.</li>
            <li>Protected product routes require an authenticated user and valid organization context.</li>
            <li>Owner-only management surfaces apply additional role and entitlement checks.</li>
          </ul>
        </div>
        <div className="enterprise-capabilities">
          <p className="marketing-kicker">PUBLIC BETA DISCLOSURE</p>
          <h2>No certification is implied by this Trust Center.</h2>
          <ul>
            <li>RYTHM does not currently claim SOC 2, ISO 27001, or another third-party security certification.</li>
            <li>Security posture and product controls will evolve during the Public Beta.</li>
            <li>Enterprise deployments require a separate review of data, permissions, integrations, and operating boundaries.</li>
            <li>Contractual privacy and data-processing terms are handled separately from this technical overview.</li>
          </ul>
        </div>
      </section>

      <section className="enterprise-contact-section">
        <div>
          <p className="marketing-kicker">VERIFY BEFORE YOU DEPLOY</p>
          <h2>Review the security model before connecting sensitive workflows.</h2>
          <p>Use the Security page for the current technical boundary, or start an Enterprise Beta conversation for organization-specific requirements.</p>
        </div>
        <div className="enterprise-contact-card">
          <h3>Trust resources</h3>
          <div className="hero-actions">
            <Link href="/security">Security posture</Link>
            <Link href="/support">Support</Link>
            <Link href="/enterprise">Enterprise review</Link>
          </div>
        </div>
      </section>
    </main>
  );
}
