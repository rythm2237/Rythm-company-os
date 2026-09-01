import type { Metadata } from "next";
import PublicComparisonPage from "../../_components/PublicComparisonPage";
import { getComparison } from "@/lib/seo/comparisons";
import { createPublicMetadata } from "@/lib/seo/site";

export const metadata: Metadata = createPublicMetadata("/compare/microsoft-copilot-studio");
export default function MicrosoftCopilotStudioComparisonPage() { return <PublicComparisonPage comparison={getComparison("microsoft-copilot-studio")} />; }
