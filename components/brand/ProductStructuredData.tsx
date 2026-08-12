import { PRODUCT_GRAPH } from "@/lib/seo/site";

export default function ProductStructuredData() {
  return (
    <script
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(PRODUCT_GRAPH).replace(/</g, "\\u003c"),
      }}
      type="application/ld+json"
    />
  );
}
