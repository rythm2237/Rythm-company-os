import type { Metadata } from "next";
import PublicKnowledgePage from "../_components/PublicKnowledgePage";
import { FAQ_CONTENT } from "@/lib/seo/public-knowledge";
import { createPublicMetadata } from "@/lib/seo/site";

export const metadata: Metadata = createPublicMetadata("/faq");

export default function FaqPage() {
  return <PublicKnowledgePage content={FAQ_CONTENT} />;
}
