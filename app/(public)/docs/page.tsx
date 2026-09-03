import type { Metadata } from "next";
import PublicKnowledgePage from "../_components/PublicKnowledgePage";
import { DOCS_CONTENT } from "@/lib/seo/public-knowledge";
import { createPublicMetadata } from "@/lib/seo/site";

export const metadata: Metadata = createPublicMetadata("/docs");

export default function DocumentationPage() {
  return (
    <>
      <PublicKnowledgePage content={DOCS_CONTENT} />
      <section className="marketing-section">
        <div className="marketing-section-heading">
          <p className="marketing-kicker">ORIGINAL RESEARCH</p>
          <h2>Governed AI Workforce Benchmark</h2>
          <p>
            Review the versioned synthetic benchmark, scoring rubric, governance failure conditions, reproducibility protocol, and interpretation limits used to evaluate governed AI-workforce behavior.
          </p>
          <div className="hero-actions">
            <a href="/research/governed-ai-workforce-benchmark">Open the benchmark</a>
          </div>
        </div>
      </section>
    </>
  );
}
