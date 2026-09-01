import type { Metadata } from "next";
import PublicKnowledgePage from "../_components/PublicKnowledgePage";
import { GLOSSARY_CONTENT } from "@/lib/seo/public-knowledge";
import { createPublicMetadata } from "@/lib/seo/site";

export const metadata: Metadata = createPublicMetadata("/glossary");

export default function GlossaryPage() {
  return <PublicKnowledgePage content={GLOSSARY_CONTENT} />;
}
