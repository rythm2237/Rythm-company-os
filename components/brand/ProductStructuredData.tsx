import { PRODUCT_GRAPH, SITE_ORIGIN, SOCIAL_IMAGE_PATH } from "@/lib/seo/site";

export default function ProductStructuredData() {
  const graph = {
    ...PRODUCT_GRAPH,
    alternateName: ["RYTHM", "RYTHM OS", "RYTHM AI Company Operating System"],
    mainEntityOfPage: `${SITE_ORIGIN}/product`,
    isPartOf: { "@id": `${SITE_ORIGIN}/#website` },
    provider: { "@id": `${SITE_ORIGIN}/#organization` },
    image: `${SITE_ORIGIN}${SOCIAL_IMAGE_PATH}`,
    browserRequirements: "A modern web browser with JavaScript enabled",
    inLanguage: "en",
    keywords: [
      "AI workforce platform",
      "AI company operating system",
      "governed AI agents",
      "human-in-the-loop AI",
      "AI agents for business",
      "virtual company with AI employees",
      "business-native AI",
    ],
    audience: {
      "@type": "BusinessAudience",
      audienceType: "Founders, operators, business teams, and organizations deploying governed AI workforces",
    },
    featureList: [
      ...PRODUCT_GRAPH.featureList,
      "Business-native operating model using roles, departments, managers, meetings, decisions, and approvals",
      "No AI infrastructure expertise required for ordinary business operation",
      "Human-in-the-loop approval boundaries for consequential actions",
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
