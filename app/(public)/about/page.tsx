import type { Metadata } from "next";
import Link from "next/link";
import PublicPageStructuredData from "@/components/brand/PublicPageStructuredData";
import { SITE_ORIGIN, createPublicMetadata } from "@/lib/seo/site";

export const metadata: Metadata = createPublicMetadata("/about");

const founderProfile = {
  "@context": "https://schema.org",
  "@type": "Person",
  "@id": `${SITE_ORIGIN}/about#founder`,
  name: "Yaser Tayyebialashti",
  jobTitle: "Founder & Operator",
  url: `${SITE_ORIGIN}/about`,
  sameAs: ["https://hu.linkedin.com/in/tayyebialashti"],
  worksFor: { "@id": `${SITE_ORIGIN}/#organization` },
  knowsAbout: ["Business operations", "Data", "Automation", "Artificial intelligence systems"],
  description:
    "Founder and operator of RYTHM Company OS, working at the intersection of business operations, data, automation, and artificial intelligence systems.",
};

export default function AboutPage() {
  return (
    <main>
      <PublicPageStructuredData path="/about" name="About RYTHM Company OS" description="What RYTHM Company OS is, who it serves, who operates it, and how its governed AI workforce keeps consequential authority with a Human CEO." breadcrumbLabel="About" dateModified="2026-09-04" />
      <script
        dangerouslySetInnerHTML={{ __html: JSON.stringify(founderProfile).replace(/</g, "\\u003c") }}
        type="application/ld+json"
      />
      <section className="public-page-hero enterprise-hero">
        <div>
          <p className="marketing-kicker">ABOUT RYTHM COMPANY OS</p>
          <h1>A governed AI workforce platform built around human authority.</h1>
        </div>
        <div><p>
          RYTHM Company OS helps a Human CEO build and operate specialized AI Agent teams
          with shared Company Memory, structured meetings, approvals, and traceable execution.
          It is currently available as a Public Beta.
        </p><p className="contact-notice">Reviewed 4 September 2026</p></div>
      </section>

      <section className="marketing-section enterprise-model">
        <div className="enterprise-capabilities">
          <p className="marketing-kicker">WHAT RYTHM IS</p>
          <h2>An operating environment for governed AI work.</h2>
          <ul>
            <li>AI Agents have explicit roles, responsibilities, reporting context, and authority limits.</li>
            <li>Company Memory keeps relevant operating context connected to organizational work.</li>
            <li>Meetings, decisions, approvals, projects, and actions remain part of one traceable operating loop.</li>
            <li>Ready-made, custom, and enterprise workforce paths support different operating needs.</li>
          </ul>
        </div>
        <div className="enterprise-capabilities">
          <p className="marketing-kicker">WHAT RYTHM IS NOT</p>
          <h2>It is not unrestricted autonomous authority.</h2>
          <ul>
            <li>The Human CEO retains final authority over consequential decisions.</li>
            <li>External publishing, spending, deployment, and messaging are locked by default.</li>
            <li>AI identity is disclosed rather than presented as a human employee.</li>
            <li>Current Public Beta controls and limits are documented in the Trust Center.</li>
          </ul>
        </div>
      </section>

      <section className="marketing-section enterprise-model">
        <div className="enterprise-capabilities">
          <p className="marketing-kicker">WHO IT IS FOR</p>
          <h2>Founders, operators, and organizations deploying AI teams.</h2>
          <p>
            RYTHM is designed for business leaders who need more organizational structure,
            governance, and continuity than a standalone chat interface or disconnected automation.
          </p>
        </div>
        <div className="enterprise-capabilities">
          <p className="marketing-kicker">FOUNDER & OPERATOR</p>
          <h2>Yaser Tayyebialashti</h2>
          <p>
            Yaser Tayyebialashti is the founder and operator of RYTHM Company OS. His professional
            work sits at the intersection of business operations, data, automation, and artificial
            intelligence systems, with a practical focus on turning AI capabilities into governed,
            usable operating workflows for organizations.
          </p>
          <p>
            RYTHM Company OS is operated through Tayyebialashti Yaser E.V., a Hungarian individual
            entrepreneur. The operating entity, registration details, and official contact channels
            are published in the <Link href="/legal">Legal Notice</Link>. The founder&apos;s public
            professional identity can be independently cross-checked on{" "}
            <a href="https://hu.linkedin.com/in/tayyebialashti" rel="me noreferrer">LinkedIn</a>.
          </p>
          <p>
            Founder-authored technical contributions and product research are kept distinct from
            independent third-party coverage; RYTHM does not present self-authored material as
            external validation.
          </p>
        </div>
      </section>

      <section className="enterprise-contact-section">
        <div>
          <p className="marketing-kicker">VERIFY THE MODEL</p>
          <h2>Explore the product and its operating boundaries.</h2>
          <p>The public Demo is synthetic and read-only, so the operating model can be examined before signup.</p>
        </div>
        <div className="enterprise-contact-card">
          <h3>Official RYTHM resources</h3>
          <div className="hero-actions">
            <Link href="/product">Product</Link>
            <Link href="/demo">Interactive Demo</Link>
            <Link href="/trust">Trust Center</Link>
            <Link href="/legal">Legal Notice</Link>
          </div>
        </div>
      </section>
    </main>
  );
}
