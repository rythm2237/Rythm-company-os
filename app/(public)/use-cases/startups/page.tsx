import type { Metadata } from "next";
import PublicKnowledgePage from "../../_components/PublicKnowledgePage";
import { STARTUP_USE_CASE_CONTENT } from "@/lib/seo/public-knowledge";
import { createPublicMetadata } from "@/lib/seo/site";

export const metadata: Metadata = createPublicMetadata("/use-cases/startups");

export default function StartupUseCasePage() {
  return <PublicKnowledgePage content={STARTUP_USE_CASE_CONTENT} />;
}
