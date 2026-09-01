import Link from "next/link";
import PublicPageStructuredData from "@/components/brand/PublicPageStructuredData";
import { COMPARISON_REVIEW_DATE, type ComparisonDefinition } from "@/lib/seo/comparisons";

export default function PublicComparisonPage({ comparison }: Readonly<{ comparison: ComparisonDefinition }>) {
  const path = `/compare/${comparison.slug}`;

  return (
    <>
      <PublicPageStructuredData
        path={path}
        name={comparison.title}
        description={comparison.summary}
        breadcrumbLabel={comparison.title}
        dateModified={COMPARISON_REVIEW_DATE}
      />
      <main className="knowledge-page comparison-page">
        <nav className="public-breadcrumbs" aria-label="Breadcrumb">
          <Link href="/">RYTHM Company OS</Link><span aria-hidden="true">/</span>
          <Link href="/compare">Compare</Link><span aria-hidden="true">/</span>
          <span aria-current="page">{comparison.competitor}</span>
        </nav>

        <section className="public-page-hero knowledge-hero">
          <div><p className="marketing-kicker">FAIR PLATFORM COMPARISON</p><h1>{comparison.title}</h1></div>
          <p>{comparison.summary}</p>
        </section>

        <section className="knowledge-definition">
          <p className="marketing-kicker">DIRECT ANSWER</p>
          <p>{comparison.bestForRythm}</p>
        </section>

        <section className="marketing-section knowledge-section">
          <div className="marketing-section-heading">
            <p className="marketing-kicker">CATEGORY CONTEXT</p>
            <h2>The products overlap, but start from different operating questions.</h2>
          </div>
          <div className="knowledge-card-grid comparison-fit-grid">
            <article><h3>Choose RYTHM when</h3><p>{comparison.bestForRythm}</p></article>
            <article><h3>Choose {comparison.competitor} when</h3><p>{comparison.bestForCompetitor}</p></article>
            <article><h3>How {comparison.competitor} describes itself</h3><p>{comparison.competitorSummary}</p></article>
          </div>
        </section>

        <section className="marketing-section knowledge-section">
          <div className="marketing-section-heading">
            <p className="marketing-kicker">COMPARISON CRITERIA</p>
            <h2>Compare the operating model, not a feature-count headline.</h2>
          </div>
          <div className="comparison-table" role="table" aria-label={`RYTHM Company OS and ${comparison.competitor} comparison`}>
            <div className="comparison-row comparison-header" role="row">
              <strong role="columnheader">Criterion</strong><strong role="columnheader">RYTHM Company OS</strong><strong role="columnheader">{comparison.competitor}</strong>
            </div>
            {comparison.rows.map((row) => (
              <div className="comparison-row" role="row" key={row.criterion}>
                <strong role="rowheader">{row.criterion}</strong><p role="cell">{row.rythm}</p><p role="cell">{row.competitor}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="marketing-section knowledge-faq">
          <div className="marketing-section-heading"><p className="marketing-kicker">DIRECT ANSWERS</p><h2>Frequently asked comparison questions</h2></div>
          <div className="knowledge-answer-list">
            {comparison.questions.map((item) => <article key={item.question}><h3>{item.question}</h3><p>{item.answer}</p></article>)}
          </div>
        </section>

        <section className="marketing-section knowledge-section comparison-sources">
          <div className="marketing-section-heading">
            <p className="marketing-kicker">PRIMARY SOURCES</p>
            <h2>Competitor facts are linked to official product material.</h2>
            <p>Sources reviewed {COMPARISON_REVIEW_DATE}. Product capabilities, packaging, and prices can change; verify current requirements directly before purchasing.</p>
          </div>
          <ul>{comparison.sources.map((source) => <li key={source.href}><a href={source.href} target="_blank" rel="noreferrer">{source.label} ↗</a></li>)}</ul>
        </section>

        <section className="marketing-cta knowledge-cta">
          <p className="marketing-kicker">VALIDATE THE FIT</p><h2>Test RYTHM's operating model against your real company workflow.</h2>
          <div className="hero-actions"><Link className="marketing-button" href="/demo">Explore the Demo</Link><Link href="/pricing">Review pricing</Link></div>
          <p className="page-review-note">Reviewed and updated {COMPARISON_REVIEW_DATE}.</p>
        </section>
      </main>
    </>
  );
}
