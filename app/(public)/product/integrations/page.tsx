import type { Metadata } from "next";
import PublicKnowledgePage from "../../_components/PublicKnowledgePage";
import { PRODUCT_INTEGRATIONS_CONTENT } from "@/lib/seo/public-knowledge";
import { createPublicMetadata } from "@/lib/seo/site";

export const metadata: Metadata = createPublicMetadata("/product/integrations");

export default function ProductIntegrationsPage() {
  return <PublicKnowledgePage content={PRODUCT_INTEGRATIONS_CONTENT} />;
}
