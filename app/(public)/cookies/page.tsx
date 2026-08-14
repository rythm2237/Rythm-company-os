import type { Metadata } from "next";
import Link from "next/link";
import { createPublicMetadata } from "@/lib/seo/site";

export const metadata: Metadata = createPublicMetadata("/cookies");

export default function CookieNoticePage() {
  return (
    <main>
      <section className="public-page-hero enterprise-hero">
        <div><p className="marketing-kicker">COOKIE & STORAGE NOTICE</p><h1>RYTHM currently uses essential browser storage, not advertising trackers.</h1></div>
        <p>Effective 14 August 2026. This notice explains cookies, local storage, and similar browser technologies used by the current Public Beta.</p>
      </section>

      <section className="marketing-section enterprise-model">
        <div className="enterprise-capabilities"><p className="marketing-kicker">STRICTLY NECESSARY</p><h2>Authentication and security state.</h2><ul><li>Authenticated areas may use session cookies or equivalent browser storage required to maintain secure sign-in state.</li><li>Password recovery uses browser-bound PKCE state so a one-time recovery flow can be completed securely in the same browser.</li><li>These technologies are required for account security and protected product functionality and are not used for advertising.</li></ul></div>
        <div className="enterprise-capabilities"><p className="marketing-kicker">LOCAL PREFERENCES</p><h2>Public experience preferences stay in the browser.</h2><ul><li>RYTHM may store language preference, Guided Tour completion/dismissal, Experience Mode discovery state, Explain RYTHM preference, and Solution Finder progress/recommendation state locally.</li><li>These preferences are used to preserve the experience between page views and do not intentionally contain account credentials or sensitive free-text data.</li><li>Users can remove this local state through browser storage controls.</li></ul></div>
      </section>

      <section className="marketing-section enterprise-model">
        <div className="enterprise-capabilities"><p className="marketing-kicker">ANALYTICS</p><h2>No third-party behavioural analytics vendor is currently wired into the public experience.</h2><ul><li>The current public-experience event layer is vendor-neutral and does not intentionally attach identity, tenant data, or free-text content to its events.</li><li>RYTHM does not currently use advertising cookies or cross-site behavioural tracking on the public experience.</li><li>If non-essential analytics, advertising, or similar tracking is introduced later, this notice and the consent mechanism will be updated before such tracking is activated where consent is required.</li></ul></div>
        <div className="enterprise-capabilities"><p className="marketing-kicker">INFRASTRUCTURE</p><h2>Service providers may set technically necessary state.</h2><ul><li>Hosting, authentication, networking, security, and other infrastructure providers may set strictly necessary cookies or technical identifiers to deliver and protect their services.</li><li>Those technologies are governed by the provider configuration and are used only to the extent required for service delivery, security, or fraud prevention.</li><li>RYTHM does not authorize those providers to use RYTHM customer data for RYTHM advertising purposes.</li></ul></div>
      </section>

      <section className="enterprise-contact-section"><div><p className="marketing-kicker">CHOICES</p><h2>Current Beta does not require an advertising-cookie banner.</h2><p>Because the current public experience does not intentionally deploy non-essential advertising or behavioural analytics cookies, RYTHM does not presently show a marketing-consent banner. If that changes, consent controls will be introduced before non-essential tracking is enabled where required by applicable law.</p></div><div className="enterprise-contact-card"><h3>Privacy resources</h3><div className="hero-actions"><Link href="/privacy">Privacy Policy</Link><Link href="/legal">Legal Notice</Link><a href="mailto:privacy@rythm-os.com">Privacy contact</a></div></div></section>
    </main>
  );
}
