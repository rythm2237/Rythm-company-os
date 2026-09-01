import type { Metadata } from "next";
import PublicKnowledgePage from "../_components/PublicKnowledgePage";
import { AI_WORKFORCE_CONTENT } from "@/lib/seo/public-knowledge";
import { createPublicMetadata } from "@/lib/seo/site";

export const metadata: Metadata = createPublicMetadata("/ai-workforce");

export default function AiWorkforcePage() {
  return <PublicKnowledgePage content={AI_WORKFORCE_CONTENT} />;
}
