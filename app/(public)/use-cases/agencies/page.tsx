import type { Metadata } from "next";
import PublicKnowledgePage from "../../_components/PublicKnowledgePage";
import { AGENCY_USE_CASE_CONTENT } from "@/lib/seo/public-knowledge";
import { createPublicMetadata } from "@/lib/seo/site";

export const metadata: Metadata = createPublicMetadata("/use-cases/agencies");

export default function AgencyUseCasePage() {
  return <PublicKnowledgePage content={AGENCY_USE_CASE_CONTENT} />;
}
