import type { Metadata } from "next";
import PublicKnowledgePage from "../_components/PublicKnowledgePage";
import { HOW_IT_WORKS_CONTENT } from "@/lib/seo/public-knowledge";
import { createPublicMetadata } from "@/lib/seo/site";

export const metadata: Metadata = createPublicMetadata("/how-it-works");

export default function HowItWorksPage() {
  return <PublicKnowledgePage content={HOW_IT_WORKS_CONTENT} />;
}
