import type { Metadata } from "next";
import PublicKnowledgePage from "../../_components/PublicKnowledgePage";
import { SOFTWARE_USE_CASE_CONTENT } from "@/lib/seo/public-knowledge";
import { createPublicMetadata } from "@/lib/seo/site";

export const metadata: Metadata = createPublicMetadata("/use-cases/software-companies");

export default function SoftwareCompanyUseCasePage() {
  return <PublicKnowledgePage content={SOFTWARE_USE_CASE_CONTENT} />;
}
