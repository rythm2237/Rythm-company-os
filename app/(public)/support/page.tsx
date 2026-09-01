import type { Metadata } from "next";
import Link from "next/link";
import PublicPageStructuredData from "@/components/brand/PublicPageStructuredData";
import { createPublicMetadata } from "@/lib/seo/site";

export const metadata: Metadata = createPublicMetadata("/support");

export default function SupportPage() {
  const supportEmail = "support@rythm-os.com";

  return (
    <main>
      <PublicPageStructuredData
        path="/support"
        name="RYTHM Company OS Support"
        description="Public Beta support, account recovery, security reporting, and incident communication paths for RYTHM Company OS."
        breadcrumbLabel="Support"
        dateModified="2026-09-01"
      />
      <section className="public-page-hero enterprise-hero">
        <div><p className="marketing-kicker">RYTHM SUPPORT</p><h1>Get to the right recovery or support path without guessing.</h1></div>
        <div><p>Public Beta support separates account recovery, product questions, commercial requests, and security reports so each request follows the correct boundary.</p><p className="contact-notice">Reviewed 1 September 2026</p></div>
      </section>

      <section className="marketing-section enterprise-model">
        <div className="enterprise-capabilities"><p className="marketing-kicker">ACCOUNT ACCESS</p><h2>Sign-in and password recovery.</h2><ul><li>Use Sign in for an existing Human CEO account.</li><li>Use Forgot password if the password is unavailable.</li><li>Always use the newest confirmation or recovery email; authentication links are single-use.</li><li>Open a recovery link in the same browser where the reset request was started.</li></ul><div className="hero-actions"><Link href="/login">Sign in</Link><Link href="/forgot-password">Forgot password</Link></div></div>
        <div className="enterprise-capabilities"><p className="marketing-kicker">PRODUCT & COMMERCIAL</p><h2>Choose the right product or deployment path.</h2><ul><li>Use the Demo before creating a persistent organization.</li><li>Use Pricing and Solution Finder to compare Ready, Custom, and Enterprise paths.</li><li>Enterprise requirements are reviewed before deployment.</li><li>Commercial activation remains controlled during the Paid Public Beta.</li></ul><div className="hero-actions"><Link href="/demo">Open Demo</Link><Link href="/pricing">Pricing</Link><Link href="/enterprise">Enterprise</Link></div></div>
      </section>

      <section className="marketing-section enterprise-model">
        <div className="enterprise-capabilities"><p className="marketing-kicker">SUPPORT SCOPE</p><h2>What the Public Beta support path covers.</h2><ul><li>Account access and recovery guidance.</li><li>Product defects, unexpected behavior, and documentation questions.</li><li>Commercial activation and deployment questions.</li><li>Security and privacy reports routed to the dedicated contacts.</li></ul><p>RYTHM does not publish a guaranteed response or resolution SLA for the Public Beta. Enterprise support expectations must be agreed in the applicable order form or contract.</p></div>
        <div className="enterprise-capabilities"><p className="marketing-kicker">INCIDENT COMMUNICATION</p><h2>How a reported issue is handled.</h2><ol><li>Report the affected page, approximate time, observed behavior, and safe reproduction steps.</li><li>RYTHM acknowledges and triages the report through the same contact thread when a reply is possible.</li><li>Material updates, required customer actions, and recovery status are communicated through that thread or the relevant customer contact.</li><li>When appropriate, a resolved report includes the known outcome and any follow-up action.</li></ol><p>Do not include passwords, one-time links, tokens, API keys, or customer-confidential data that is not necessary to reproduce the issue.</p></div>
      </section>

      <section className="enterprise-contact-section">
        <div><p className="marketing-kicker">BETA SUPPORT</p><h2>Need help that the self-service paths do not solve?</h2><p>Include the page URL, what you attempted, the exact message shown, and the approximate time of the issue. Never send a password, one-time authentication link, API key, or access token.</p></div>
        <div className="enterprise-contact-card"><h3>Contact path</h3><a className="marketing-button" href={`mailto:${supportEmail}?subject=${encodeURIComponent("RYTHM Public Beta support")}`}>Email Support</a><p className="contact-notice">{supportEmail}</p><div className="hero-actions"><a href="mailto:sales@rythm-os.com">Sales</a><Link href="/security">Security issue?</Link></div></div>
      </section>
    </main>
  );
}
