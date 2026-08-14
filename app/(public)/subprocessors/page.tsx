import type { Metadata } from "next";
import Link from "next/link";
import { createPublicMetadata } from "@/lib/seo/site";

export const metadata: Metadata = createPublicMetadata("/subprocessors");

const subprocessors = [
  {
    provider: "Supabase",
    purpose: "Production database, authentication, tenant-scoped application data, and related backend infrastructure.",
    data: "Account identifiers, authentication data, organization/workspace data, application records, and service metadata as required by the enabled feature.",
    transfer: "Processing location and transfer safeguards depend on the contracted Supabase service configuration and applicable provider terms.",
  },
  {
    provider: "Vercel",
    purpose: "Web application hosting, deployment, delivery, runtime execution, and platform infrastructure.",
    data: "HTTP/request metadata, application runtime data, deployment logs, and content required to deliver the service.",
    transfer: "Processing location and transfer safeguards depend on the contracted Vercel service configuration and applicable provider terms.",
  },
  {
    provider: "OpenAI",
    purpose: "AI model inference for features that explicitly invoke an AI model, including governed meeting and agent workflows.",
    data: "Prompts, instructions, relevant workspace context, meeting transcript excerpts, and generated outputs required for the invoked feature.",
    transfer: "Processing and transfer safeguards are governed by the applicable OpenAI business/service terms and the deployment configuration used by RYTHM.",
  },
  {
    provider: "Cloudflare",
    purpose: "Domain, DNS, routing, security, and email-routing infrastructure used for RYTHM public domains and operational email routing.",
    data: "Network/DNS metadata and email-routing metadata or message data where the configured routing service handles it.",
    transfer: "Processing location and transfer safeguards depend on the Cloudflare services enabled for the RYTHM domain and applicable provider terms.",
  },
] as const;

export default function SubprocessorsPage() {
  return (
    <main>
      <section className="public-page-hero enterprise-hero">
        <div><p className="marketing-kicker">SUBPROCESSOR REGISTER</p><h1>Infrastructure providers that may process customer personal data for RYTHM.</h1></div>
        <p>Effective 14 August 2026. This register reflects the current Public Beta architecture verified in the RYTHM application and deployment stack. It is updated when a material processor is added, removed, or its role materially changes.</p>
      </section>

      <section className="marketing-section enterprise-model">
        {subprocessors.map((item) => (
          <div className="enterprise-capabilities" key={item.provider}>
            <p className="marketing-kicker">{item.provider.toUpperCase()}</p>
            <h2>{item.purpose}</h2>
            <ul>
              <li><strong>Data involved:</strong> {item.data}</li>
              <li><strong>International transfers:</strong> {item.transfer}</li>
              <li>Only the data reasonably necessary for the enabled service capability should be sent to this provider.</li>
            </ul>
          </div>
        ))}
      </section>

      <section className="marketing-section enterprise-model">
        <div className="enterprise-capabilities">
          <p className="marketing-kicker">CHANGES</p>
          <h2>How subprocessor changes are handled.</h2>
          <ul>
            <li>RYTHM will maintain this page as the current public register for the Public Beta.</li>
            <li>Where an executed customer agreement or DPA requires advance notice of a new subprocessor, that contractual notice process controls.</li>
            <li>Customers with a documented objection right should raise a data-protection concern promptly through the Privacy contact so the parties can assess the specific processing risk.</li>
          </ul>
        </div>
        <div className="enterprise-capabilities">
          <p className="marketing-kicker">SCOPE</p>
          <h2>Not every provider receives every customer record.</h2>
          <ul>
            <li>Provider access depends on the feature invoked and the data required to operate it.</li>
            <li>The public Demo is synthetic and read-only and is not intended for real customer personal data.</li>
            <li>Customer-authorized integrations may introduce additional processors; those should be reviewed before production activation.</li>
          </ul>
        </div>
      </section>

      <section className="enterprise-contact-section">
        <div><p className="marketing-kicker">PRIVACY CONTACT</p><h2>Need a processor or transfer review?</h2><p>Enterprise customers can request the current processor architecture, DPA terms, and deployment-specific review before submitting sensitive data.</p></div>
        <div className="enterprise-contact-card"><h3>Data-protection resources</h3><a className="marketing-button" href="mailto:privacy@rythm-os.com">Email Privacy</a><div className="hero-actions"><Link href="/dpa">DPA</Link><Link href="/privacy">Privacy Policy</Link></div></div>
      </section>
    </main>
  );
}
