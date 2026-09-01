import Link from "next/link";
import PublicPageStructuredData from "@/components/brand/PublicPageStructuredData";

export type KnowledgeItem = Readonly<{
  title: string;
  detail: string;
}>;

export type KnowledgeSection = Readonly<{
  eyebrow: string;
  title: string;
  paragraphs?: readonly string[];
  items?: readonly KnowledgeItem[];
}>;

export type KnowledgeQuestion = Readonly<{
  question: string;
  answer: string;
}>;

export type PublicKnowledgeContent = Readonly<{
  path: string;
  breadcrumbLabel: string;
  kicker: string;
  title: string;
  summary: string;
  definition?: string;
  sections: readonly KnowledgeSection[];
  questions?: readonly KnowledgeQuestion[];
  primaryCta?: Readonly<{ label: string; href: string }>;
  secondaryCta?: Readonly<{ label: string; href: string }>;
  reviewedOn?: string;
}>;

type Props = Readonly<{ content: PublicKnowledgeContent }>;

export default function PublicKnowledgePage({ content }: Props) {
  return (
    <>
      <PublicPageStructuredData
        breadcrumbLabel={content.breadcrumbLabel}
        dateModified={content.reviewedOn}
        description={content.summary}
        name={content.title}
        path={content.path}
      />
      <main className="knowledge-page">
        <nav className="public-breadcrumbs" aria-label="Breadcrumb">
          <Link href="/">RYTHM Company OS</Link>
          <span aria-hidden="true">/</span>
          <span aria-current="page">{content.breadcrumbLabel}</span>
        </nav>

        <section className="public-page-hero knowledge-hero">
          <div>
            <p className="marketing-kicker">{content.kicker}</p>
            <h1>{content.title}</h1>
          </div>
          <p>{content.summary}</p>
        </section>

        {content.definition ? (
          <section className="knowledge-definition" aria-label={`${content.breadcrumbLabel} definition`}>
            <p className="marketing-kicker">SHORT DEFINITION</p>
            <p>{content.definition}</p>
          </section>
        ) : null}

        {content.sections.map((section) => (
          <section className="marketing-section knowledge-section" key={section.title}>
            <div className="marketing-section-heading">
              <p className="marketing-kicker">{section.eyebrow}</p>
              <h2>{section.title}</h2>
              {section.paragraphs?.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
            </div>
            {section.items?.length ? (
              <div className="knowledge-card-grid">
                {section.items.map((item) => (
                  <article key={item.title}>
                    <h3>{item.title}</h3>
                    <p>{item.detail}</p>
                  </article>
                ))}
              </div>
            ) : null}
          </section>
        ))}

        {content.questions?.length ? (
          <section className="marketing-section knowledge-faq" id="frequently-asked-questions">
            <div className="marketing-section-heading">
              <p className="marketing-kicker">DIRECT ANSWERS</p>
              <h2>Frequently asked questions</h2>
            </div>
            <div className="knowledge-answer-list">
              {content.questions.map((item) => (
                <article key={item.question}>
                  <h3>{item.question}</h3>
                  <p>{item.answer}</p>
                </article>
              ))}
            </div>
          </section>
        ) : null}

        <section className="marketing-cta knowledge-cta">
          <p className="marketing-kicker">NEXT STEP</p>
          <h2>See the governed operating model before you choose a plan.</h2>
          <div className="hero-actions">
            <Link className="marketing-button" href={content.primaryCta?.href ?? "/demo"}>
              {content.primaryCta?.label ?? "Explore the Demo"}
            </Link>
            <Link href={content.secondaryCta?.href ?? "/pricing"}>
              {content.secondaryCta?.label ?? "Review pricing"}
            </Link>
          </div>
          {content.reviewedOn ? <p className="page-review-note">Reviewed and updated {content.reviewedOn}.</p> : null}
        </section>
      </main>
    </>
  );
}
