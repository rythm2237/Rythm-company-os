import type { Metadata } from "next";
import PublicComparisonPage from "../../_components/PublicComparisonPage";
import { getComparison } from "@/lib/seo/comparisons";
import { createPublicMetadata } from "@/lib/seo/site";

export const metadata: Metadata = createPublicMetadata("/compare/relevance-ai");
export default function RelevanceAiComparisonPage() { return <PublicComparisonPage comparison={getComparison("relevance-ai")} />; }
