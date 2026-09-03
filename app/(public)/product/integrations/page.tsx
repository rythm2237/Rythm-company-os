import type { Metadata } from "next";
import Link from "next/link";
import PublicKnowledgePage from "../../_components/PublicKnowledgePage";
import { PRODUCT_INTEGRATIONS_CONTENT } from "@/lib/seo/public-knowledge";
import { createPublicMetadata } from "@/lib/seo/site";

export const metadata: Metadata = createPublicMetadata("/product/integrations");

export default function ProductIntegrationsPage() {
  return (
    <>
      <PublicKnowledgePage content={PRODUCT_INTEGRATIONS_CONTENT} />
      <section className="marketing-section knowledge-section" aria-labelledby="integration-evidence-heading">
        <div className="marketing-section-heading">
          <p className="marketing-kicker">VERIFIABLE EVIDENCE</p>
          <h2 id="integration-evidence-heading">Check implemented integration contracts separately from partnership claims.</h2>
          <p>
            The public evidence register lists current provider families, implemented operations, official provider API references, source-code evidence, and the explicit boundary between technical integration and official partnership.
          </p>
          <div className="hero-actions">
            <Link className="marketing-button" href="/product/integrations/evidence">Review integration evidence</Link>
            <a href="/integration-evidence-v1.json">Open machine-readable register</a>
          </div>
        </div>
      </section>
    </>
  );
}
