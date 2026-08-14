import type { Metadata } from "next";
import Link from "next/link";
import { createPublicMetadata } from "@/lib/seo/site";

export const metadata: Metadata = createPublicMetadata("/data-requests");

export default function DataRequestsPage() {
  return (
    <main>
      <section className="public-page-hero enterprise-hero">
        <div><p className="marketing-kicker">DATA REQUESTS</p><h1>Exercise privacy rights or request a customer-data export or deletion.</h1></div>
        <p>RYTHM provides an electronic request channel for access, correction, deletion, restriction, objection, and portability requests. We normally respond without undue delay and within the timeframe required by applicable data-protection law.</p>
      </section>

      <section className="marketing-section enterprise-model">
        <div className="enterprise-capabilities"><p className="marketing-kicker">HOW TO REQUEST</p><h2>Send the minimum information needed to identify the request.</h2><ul><li>Email <a href="mailto:privacy@rythm-os.com">privacy@rythm-os.com</a> from the email address associated with your RYTHM account where possible.</li><li>State the organization/workspace name and the right you want to exercise: access, correction, deletion, restriction, objection, or portability.</li><li>For customer-controller requests, identify whether you are the organization owner/authorized contact or the individual data subject.</li><li>Do not send passwords, one-time links, API keys, payment-card data, government IDs, or unrelated confidential material in the initial request.</li></ul></div>
        <div className="enterprise-capabilities"><p className="marketing-kicker">IDENTITY & AUTHORITY</p><h2>RYTHM verifies scope before releasing or deleting data.</h2><ul><li>We may ask for reasonable additional information to confirm identity or authority where necessary.</li><li>Organization data will not be exported or deleted solely because an unverified third party asks for it.</li><li>If RYTHM processes the data only on behalf of a customer organization, we may redirect or coordinate the request with that controller where legally appropriate.</li><li>Verification information is limited to what is reasonably necessary for the request.</li></ul></div>
      </section>

      <section className="marketing-section enterprise-model">
        <div className="enterprise-capabilities"><p className="marketing-kicker">ACCESS & EXPORT</p><h2>Validated requests can receive a structured copy of relevant personal data.</h2><ul><li>Access responses identify whether relevant personal data is being processed and provide a copy where required.</li><li>Where portability applies, RYTHM will use a commonly used machine-readable format where technically reasonable.</li><li>Exports are scoped to the verified requester and organization authority and are reviewed to avoid disclosing another person's protected data.</li><li>Security secrets, internal anti-abuse signals, privileged credentials, and data that would adversely affect the rights of others are not disclosed merely because an export is requested.</li></ul></div>
        <div className="enterprise-capabilities"><p className="marketing-kicker">DELETION</p><h2>Deletion requests are assessed against legal and operational retention duties.</h2><ul><li>Eligible account or workspace data is removed from active systems after scope and authority are confirmed.</li><li>Some records may be retained where law requires it or where necessary for security, fraud prevention, accounting, dispute handling, or legal claims.</li><li>Residual encrypted backup copies may remain until their normal backup lifecycle expires; they are not used for ordinary production processing.</li><li>Where only part of a record must be retained, RYTHM will seek to minimize or isolate the retained data where reasonably possible.</li></ul></div>
      </section>

      <section className="marketing-section enterprise-model">
        <div className="enterprise-capabilities"><p className="marketing-kicker">TIMING</p><h2>Requests are tracked from receipt through closure.</h2><ul><li>GDPR requests are handled without undue delay and, in principle, within one month of receipt once the request can be properly identified.</li><li>Where the GDPR permits an extension for complex or numerous requests, the requester will be informed within the required initial period.</li><li>If a request is refused or limited, RYTHM will provide the legally required explanation and available complaint/remedy information.</li><li>Requests are generally handled without charge, subject to the limited exceptions allowed by applicable law for manifestly unfounded or excessive requests.</li></ul></div>
        <div className="enterprise-capabilities"><p className="marketing-kicker">CONTROLLER CONTACT</p><h2>RYTHM privacy contact.</h2><ul><li>Controller: Tayyebialashti Yaser E.V., 1143 Budapest, Gizella út 35, Hungary.</li><li>Email: <a href="mailto:privacy@rythm-os.com">privacy@rythm-os.com</a>.</li><li>Contractual privacy questions: <a href="mailto:legal@rythm-os.com">legal@rythm-os.com</a>.</li><li>Individuals may also contact the competent supervisory authority as described in the <Link href="/privacy">Privacy Policy</Link>.</li></ul></div>
      </section>

      <section className="enterprise-contact-section"><div><p className="marketing-kicker">SUBMIT A REQUEST</p><h2>Use the dedicated privacy channel.</h2><p>For security incidents, use security@rythm-os.com instead of the data-rights channel so incident triage can begin immediately.</p></div><div className="enterprise-contact-card"><h3>Privacy request</h3><a className="marketing-button" href="mailto:privacy@rythm-os.com?subject=Privacy%20data%20request">Email Privacy</a><div className="hero-actions"><Link href="/dpa">DPA</Link><Link href="/subprocessors">Subprocessors</Link></div></div></section>
    </main>
  );
}
