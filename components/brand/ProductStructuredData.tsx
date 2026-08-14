import { PRODUCT_GRAPH, SITE_ORIGIN, SOCIAL_IMAGE_PATH } from "@/lib/seo/site";

export default function ProductStructuredData() {
  const graph = {
    ...PRODUCT_GRAPH,
    mainEntityOfPage: `${SITE_ORIGIN}/product`,
    isPartOf: { "@id": `${SITE_ORIGIN}/#website` },
    provider: { "@id": `${SITE_ORIGIN}/#organization` },
    image: `${SITE_ORIGIN}${SOCIAL_IMAGE_PATH}`,
    browserRequirements: "A modern web browser with JavaScript enabled",
    inLanguage: "en",
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
