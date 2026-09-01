import { ORGANIZATION_GRAPH } from "@/lib/seo/site";

export default function OrganizationStructuredData() {
  return (
    <script
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(ORGANIZATION_GRAPH).replace(/</g, "\\u003c"),
      }}
      type="application/ld+json"
    />
  );
}
