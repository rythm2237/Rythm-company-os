import { absoluteUrl, SITE_NAME, SITE_ORIGIN } from "@/lib/seo/site";

type StructuredQuestion = Readonly<{
  question: string;
  answer: string;
}>;

type PublicPageStructuredDataProps = Readonly<{
  path: string;
  name: string;
  description: string;
  breadcrumbLabel: string;
  dateModified?: string;
  questions?: readonly StructuredQuestion[];
}>;

export default function PublicPageStructuredData({
  path,
  name,
  description,
  breadcrumbLabel,
  dateModified,
  questions,
}: PublicPageStructuredDataProps) {
  const pageUrl = absoluteUrl(path);
  const graph = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebPage",
        "@id": `${pageUrl}#webpage`,
        url: pageUrl,
        name,
        description,
        isPartOf: { "@id": `${SITE_ORIGIN}/#website` },
        about: { "@id": `${SITE_ORIGIN}/#company-os` },
        mainEntity: { "@id": `${SITE_ORIGIN}/#company-os` },
        publisher: { "@id": `${SITE_ORIGIN}/#organization` },
        inLanguage: "en",
        ...(dateModified ? { dateModified } : {}),
      },
      {
        "@type": "BreadcrumbList",
        "@id": `${pageUrl}#breadcrumb`,
        itemListElement: [
          {
            "@type": "ListItem",
            position: 1,
            name: SITE_NAME,
            item: SITE_ORIGIN,
          },
          {
            "@type": "ListItem",
            position: 2,
            name: breadcrumbLabel,
            item: pageUrl,
          },
        ],
      },
      ...(questions?.length
        ? [
            {
              "@type": "FAQPage",
              "@id": `${pageUrl}#faq`,
              url: `${pageUrl}#frequently-asked-questions`,
              isPartOf: { "@id": `${pageUrl}#webpage` },
              mainEntity: questions.map((item) => ({
                "@type": "Question",
                name: item.question,
                acceptedAnswer: {
                  "@type": "Answer",
                  text: item.answer,
                },
              })),
            },
          ]
        : []),
    ],
  };

  return (
    <script
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(graph).replace(/</g, "\\u003c"),
      }}
      type="application/ld+json"
    />
  );
}
