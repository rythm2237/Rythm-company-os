import { ORGANIZATION_GRAPH } from "@/lib/seo/site";

export default function OrganizationStructuredData() {
  const graph = {
    ...ORGANIZATION_GRAPH,
    "@graph": ORGANIZATION_GRAPH["@graph"].map((node) =>
      node["@type"] === "Organization"
        ? {
            ...node,
            identifier: {
              "@type": "PropertyValue",
              propertyID: "Hungarian Individual Entrepreneurs Register",
              value: "58642889",
            },
            brand: {
              "@type": "Brand",
              name: "RYTHM",
              alternateName: "RYTHM Company OS",
              url: "https://company.rythm-os.com",
            },
          }
        : node,
    ),
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
