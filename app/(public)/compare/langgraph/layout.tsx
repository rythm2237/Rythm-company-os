import type { ReactNode } from "react";
import { createStandalonePublicMetadata } from "@/lib/seo/standalone-metadata";

export const metadata = createStandalonePublicMetadata(
  "/compare/langgraph",
  "RYTHM Company OS vs LangGraph",
  "Compare RYTHM's governed AI company operating model with LangGraph's low-level Agent orchestration framework and runtime using official LangChain sources.",
);

export default function LangGraphComparisonLayout({ children }: Readonly<{ children: ReactNode }>) {
  return children;
}
