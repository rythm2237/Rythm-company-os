import type { Metadata } from "next";
import Link from "next/link";
import PublicKnowledgePage from "../_components/PublicKnowledgePage";
import { HOW_IT_WORKS_CONTENT } from "@/lib/seo/public-knowledge";
import { createPublicMetadata } from "@/lib/seo/site";

export const metadata: Metadata = createPublicMetadata("/how-it-works");

export default function HowItWorksPage() {
  return (
    <>
      <PublicKnowledgePage content={HOW_IT_WORKS_CONTENT} />
      <section className="marketing-section how-section" aria-labelledby="business-native-ai-title">
        <div className="marketing-section-heading">
          <p className="marketing-kicker">BUSINESS-NATIVE EXPERIENCE</p>
          <h2 id="business-native-ai-title">Use AI through familiar company concepts—not AI infrastructure.</h2>
          <p>
            Operating RYTHM does not require users to understand prompting frameworks, orchestration code, model routing, MCP, or agent-runtime design. The product presents AI work through familiar business concepts such as roles, departments, managers, meetings, decisions, approvals, and responsibilities.
          </p>
        </div>
        <div className="how-grid">
          <article><span>01</span><h3>Assign work by role</h3><p>Work with a Strategy Agent, Operations Agent, Finance Agent, or another business role instead of configuring an AI workflow from scratch.</p></article>
          <article><span>02</span><h3>Manage through company structure</h3><p>Departments, reporting lines, responsibilities, and authority boundaries provide the operating model users already recognize.</p></article>
          <article><span>03</span><h3>Decide through meetings and approvals</h3><p>Users can review recommendations, make decisions, and approve consequential work without needing to reason about the underlying model stack.</p></article>
          <article><span>04</span><h3>Keep technical complexity behind the product</h3><p>Routing, permissions, policy checks, execution controls, and AI infrastructure remain implementation concerns rather than requirements for ordinary business users.</p></article>
        </div>
        <div className="hero-actions"><Link href="/product">Explore the product</Link><Link href="/demo">Try the public demo</Link></div>
      </section>
    </>
  );
}
