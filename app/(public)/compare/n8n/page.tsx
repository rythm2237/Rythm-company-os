import type { Metadata } from "next";
import PublicComparisonPage from "../../_components/PublicComparisonPage";
import { getComparison } from "@/lib/seo/comparisons";

export const metadata: Metadata = {
  title: "RYTHM Company OS vs n8n",
  description: "Compare RYTHM's governed AI company operating model with n8n's workflow automation and AI Agent platform using official n8n sources.",
  alternates: { canonical: "/compare/n8n" },
};

export default function N8nComparisonPage() {
  return <PublicComparisonPage comparison={getComparison("n8n")} />;
}
