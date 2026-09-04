import { ORGANIZATION_GRAPH, SITE_ORIGIN } from "@/lib/seo/site";

const VERIFIED_ORGANIZATION_PROFILES = [
  "https://www.linkedin.com/company/rythm-company-os",
  "https://github.com/Rythm-os",
] as const;

const CATEGORY_PAGES = [
  `${SITE_ORIGIN}/ai-workforce`,
  `${SITE_ORIGIN}/ai-company-operating-system`,
  `${SITE_ORIGIN}/ai-agents-for-business`,
  `${SITE_ORIGIN}/how-it-works`,
  `${SITE_ORIGIN}/compare`,
] as const;

const organizationGraphWithVerifiedProfiles = {
  ...ORGANIZATION_GRAPH,
  "@graph": ORGANIZATION_GRAPH["@graph"].map((entity) => {
    if (entity["@type"] === "Organization") {
      return {
        ...entity,
        sameAs: VERIFIED_ORGANIZATION_PROFILES,
        slogan: "Run an AI workforce like you run a company—not like you build an AI system.",
        subjectOf: CATEGORY_PAGES.map((url) => ({ "@type": "WebPage", url })),
      };
    }

    if (entity["@type"] === "WebSite") {
      return {
        ...entity,
        about: { "@id": `${SITE_ORIGIN}/#company-os` },
      };
    }

    return entity;
  }),
};

export default function OrganizationStructuredData() {
  return (
    <script
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(organizationGraphWithVerifiedProfiles).replace(/</g, "\\u003c"),
      }}
      type="application/ld+json"
    />
  );
}
