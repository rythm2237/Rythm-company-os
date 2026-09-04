import type { ReactNode } from "react";
import { createStandalonePublicMetadata } from "@/lib/seo/standalone-metadata";

export const metadata = createStandalonePublicMetadata(
  "/platforms-for-building-company-with-ai-agents",
  "Platforms for Building a Company with AI Agents",
  "A direct, non-ranking guide to choosing platforms for building a company with AI agents based on orchestration, automation, enterprise ecosystem, or company operating model.",
);

export default function PlatformsForBuildingCompanyWithAiAgentsLayout({ children }: Readonly<{ children: ReactNode }>) {
  return children;
}
