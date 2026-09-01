import type { Metadata } from "next";
import PublicKnowledgePage from "../_components/PublicKnowledgePage";
import { DOCS_CONTENT } from "@/lib/seo/public-knowledge";
import { createPublicMetadata } from "@/lib/seo/site";

export const metadata: Metadata = createPublicMetadata("/docs");

export default function DocumentationPage() {
  return <PublicKnowledgePage content={DOCS_CONTENT} />;
}
