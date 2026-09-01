import type { Metadata } from "next";
import PublicKnowledgePage from "../_components/PublicKnowledgePage";
import { PRODUCT_ARCHITECTURE_CONTENT } from "@/lib/seo/public-knowledge";
import { createPublicMetadata } from "@/lib/seo/site";

export const metadata: Metadata = createPublicMetadata("/product-architecture");

export default function ProductArchitecturePage() {
  return <PublicKnowledgePage content={PRODUCT_ARCHITECTURE_CONTENT} />;
}
