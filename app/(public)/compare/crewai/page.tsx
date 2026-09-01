import type { Metadata } from "next";
import PublicComparisonPage from "../../_components/PublicComparisonPage";
import { getComparison } from "@/lib/seo/comparisons";
import { createPublicMetadata } from "@/lib/seo/site";

export const metadata: Metadata = createPublicMetadata("/compare/crewai");
export default function CrewaiComparisonPage() { return <PublicComparisonPage comparison={getComparison("crewai")} />; }
