import type { Metadata } from "next";
import PublicKnowledgePage from "../../_components/PublicKnowledgePage";
import { PRODUCT_AGENTS_CONTENT } from "@/lib/seo/public-knowledge";
import { createPublicMetadata } from "@/lib/seo/site";

export const metadata: Metadata = createPublicMetadata("/product/ai-agents");

export default function ProductAiAgentsPage() {
  return <PublicKnowledgePage content={PRODUCT_AGENTS_CONTENT} />;
}
