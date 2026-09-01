import type { Metadata } from "next";
import PublicKnowledgePage from "../_components/PublicKnowledgePage";
import { AI_AGENTS_FOR_BUSINESS_CONTENT } from "@/lib/seo/public-knowledge";
import { createPublicMetadata } from "@/lib/seo/site";

export const metadata: Metadata = createPublicMetadata("/ai-agents-for-business");

export default function AiAgentsForBusinessPage() {
  return <PublicKnowledgePage content={AI_AGENTS_FOR_BUSINESS_CONTENT} />;
}
