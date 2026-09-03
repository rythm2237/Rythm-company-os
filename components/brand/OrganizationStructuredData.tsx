import { ORGANIZATION_GRAPH } from "@/lib/seo/site";

const VERIFIED_ORGANIZATION_PROFILES = [
  "https://www.linkedin.com/company/rythm-company-os",
  "https://github.com/Rythm-os",
] as const;

const organizationGraphWithVerifiedProfiles = {
  ...ORGANIZATION_GRAPH,
  "@graph": ORGANIZATION_GRAPH["@graph"].map((entity) =>
    entity["@type"] === "Organization"
      ? { ...entity, sameAs: VERIFIED_ORGANIZATION_PROFILES }
      : entity,
  ),
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
