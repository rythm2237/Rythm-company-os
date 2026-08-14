import type { Metadata } from "next";
import Link from "next/link";
import { createPublicMetadata } from "@/lib/seo/site";

export const metadata: Metadata = createPublicMetadata("/legal");

export default function LegalNoticePage() {
  return (
    <main>
      <section className="public-page-hero enterprise-hero">
        <div><p className="marketing-kicker">LEGAL NOTICE</p><h1>RYTHM Company OS is operated by a Hungarian individual entrepreneur.</h1></div>
        <p>This notice identifies the service provider behind RYTHM and the official channels for commercial, legal, privacy, security, billing, and support matters.</p>
      </section>

      <section className="marketing-section enterprise-model">
        <div className="enterprise-capabilities">
          <p className="marketing-kicker">SERVICE PROVIDER</p>
          <h2>Tayyebialashti Yaser E.V.</h2>
          <ul>
            <li>Legal form: individual entrepreneur (egyéni vállalkozó / e.v.), Hungary</li>
            <li>Business address: 1143 Budapest, Gizella út 35, Hungary</li>
            <li>Registration number (Nyilvántartási szám): 58642889</li>
            <li>Hungarian tax number: 48332376-1-42</li>
            <li>Registration authority: Hungarian National Tax and Customs Administration (NAV), Individual Entrepreneurs Register</li>
            <li>Public registry records may be verified through NAV using the registration or tax number above.</li>
          </ul>
        </div>
        <div className="enterprise-capabilities">
          <p className="marketing-kicker">RYTHM CONTACTS</p>
          <h2>Use the channel that matches the request.</h2>
          <ul>
            <li><a href="mailto:hello@rythm-os.com">hello@rythm-os.com</a> — general enquiries</li>
            <li><a href="mailto:sales@rythm-os.com">sales@rythm-os.com</a> — sales and enterprise enquiries</li>
            <li><a href="mailto:support@rythm-os.com">support@rythm-os.com</a> — customer support</li>
            <li><a href="mailto:privacy@rythm-os.com">privacy@rythm-os.com</a> — privacy and data-rights requests</li>
            <li><a href="mailto:legal@rythm-os.com">legal@rythm-os.com</a> — legal and contractual matters</li>
            <li><a href="mailto:security@rythm-os.com">security@rythm-os.com</a> — responsible security reports</li>
            <li><a href="mailto:billing@rythm-os.com">billing@rythm-os.com</a> — billing and invoice matters</li>
          </ul>
        </div>
      </section>

      <section className="enterprise-contact-section">
        <div><p className="marketing-kicker">PUBLIC BETA</p><h2>Commercial availability is worldwide, subject to applicable law and product eligibility.</h2><p>RYTHM is currently offered as a Public Beta. Enterprise deployments, regulated use cases, sensitive-data workflows, and jurisdiction-specific requirements may require an additional review before activation.</p></div>
        <div className="enterprise-contact-card"><h3>Related notices</h3><div className="hero-actions"><Link href="/terms">Terms of Service</Link><Link href="/privacy">Privacy Policy</Link><Link href="/cookies">Cookie & Storage Notice</Link></div></div>
      </section>
    </main>
  );
}
