import type { Metadata } from "next";
import Link from "next/link";
import PublicPageStructuredData from "@/components/brand/PublicPageStructuredData";
import { COMPARISONS, COMPARISON_REVIEW_DATE } from "@/lib/seo/comparisons";
import { createPublicMetadata } from "@/lib/seo/site";

export const metadata: Metadata = createPublicMetadata("/compare");

export default function ComparePage() {
  return (
    <>
      <PublicPageStructuredData path="/compare" name="Compare RYTHM Company OS" description="Fair, source-linked comparisons between RYTHM Company OS and current AI Agent, AI workforce, and multi-agent platforms." breadcrumbLabel="Compare" dateModified={COMPARISON_REVIEW_DATE} />
      <main className="knowledge-page">
        <nav className="public-breadcrumbs" aria-label="Breadcrumb"><Link href="/">RYTHM Company OS</Link><span aria-hidden="true">/</span><span aria-current="page">Compare</span></nav>
        <section className="public-page-hero knowledge-hero"><div><p className="marketing-kicker">PLATFORM COMPARISONS</p><h1>Compare RYTHM by operating model, governance, and buyer fit.</h1></div><p>These comparisons separate verified competitor facts from RYTHM product facts and link changing claims to official sources. They are decision support, not winner-by-feature-count pages.</p></section>
        <section className="marketing-section knowledge-section">
          <div className="marketing-section-heading"><p className="marketing-kicker">CURRENT COMPARISONS</p><h2>Start with the platform closest to your buying shortlist.</h2></div>
          <div className="knowledge-card-grid comparison-link-grid">
            {COMPARISONS.map((comparison) => <article key={comparison.slug}><h3>RYTHM vs {comparison.competitor}</h3><p>{comparison.summary}</p><Link href={`/compare/${comparison.slug}`}>Open comparison →</Link></article>)}
          </div>
        </section>
        <section className="marketing-section knowledge-section"><div className="marketing-section-heading"><p className="marketing-kicker">METHOD</p><h2>What every comparison checks.</h2><p>Primary category, intended user, organizational model, multi-agent coordination, knowledge and memory, human authority, permissions and approvals, integration boundary, execution evidence, pricing model, and implementation responsibility.</p><p className="page-review-note">Reviewed and updated {COMPARISON_REVIEW_DATE}.</p></div></section>
      </main>
    </>
  );
}
