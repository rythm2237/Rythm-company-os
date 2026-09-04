import type { Metadata } from "next";
import Link from "next/link";
import PublicKnowledgePage from "../_components/PublicKnowledgePage";
import { PRODUCT_ARCHITECTURE_CONTENT } from "@/lib/seo/public-knowledge";
import { createPublicMetadata } from "@/lib/seo/site";

export const metadata: Metadata = createPublicMetadata("/product-architecture");

export default function ProductArchitecturePage() {
  return (
    <>
      <PublicKnowledgePage content={PRODUCT_ARCHITECTURE_CONTENT} />
      <section className="marketing-section knowledge-section" aria-labelledby="governance-architecture-reading">
        <div className="marketing-section-heading">
          <p className="marketing-kicker">ARCHITECTURE IN CONTEXT</p>
          <h2 id="governance-architecture-reading">Connect the technical architecture to the operating and authority model.</h2>
          <p>
            RYTHM's architecture separates AI reasoning from organizational authority and consequential execution. These answer-first guides explain how that model differs from chat assistants and workflow automation, and how human approval can remain explicit at high-impact boundaries.
          </p>
        </div>
        <div className="hero-actions">
          <Link href="/ai-company-operating-system-vs-chatgpt-automation">AI Company OS vs ChatGPT and automation</Link>
          <Link href="/human-approval-ai-agents">Human approval and consequential authority</Link>
          <Link href="/ai-transparency">AI transparency and governance</Link>
        </div>
      </section>
    </>
  );
}
