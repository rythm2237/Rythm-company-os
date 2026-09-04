import type { Metadata } from "next";
import PublicComparisonPage from "../../_components/PublicComparisonPage";
import { getComparison } from "@/lib/seo/comparisons";

export const metadata: Metadata = {
  title: "RYTHM Company OS vs LangGraph",
  description: "Compare RYTHM's governed AI company operating model with LangGraph's low-level Agent orchestration framework and runtime using official LangChain sources.",
  alternates: { canonical: "/compare/langgraph" },
};

export default function LangGraphComparisonPage() {
  return <PublicComparisonPage comparison={getComparison("langgraph")} />;
}
