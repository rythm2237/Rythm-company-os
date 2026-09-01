import { absoluteUrl, SITE_NAME, SITE_ORIGIN } from "@/lib/seo/site";

type PublicPageStructuredDataProps = Readonly<{
  path: string;
  name: string;
  description: string;
  breadcrumbLabel: string;
  dateModified?: string;
}>;

export default function PublicPageStructuredData({
  path,
  name,
  description,
  breadcrumbLabel,
  dateModified,
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
