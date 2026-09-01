import type { Metadata } from "next";
import PublicKnowledgePage from "../_components/PublicKnowledgePage";
import { USE_CASES_CONTENT } from "@/lib/seo/public-knowledge";
import { createPublicMetadata } from "@/lib/seo/site";

export const metadata: Metadata = createPublicMetadata("/use-cases");

export default function UseCasesPage() {
  return <PublicKnowledgePage content={USE_CASES_CONTENT} />;
}
