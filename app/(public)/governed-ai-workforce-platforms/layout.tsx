import type { ReactNode } from "react";
import { createStandalonePublicMetadata } from "@/lib/seo/standalone-metadata";

export const metadata = createStandalonePublicMetadata(
  "/governed-ai-workforce-platforms",
  "Governed AI Workforce Platforms",
  "A direct guide to evaluating governed AI workforce platforms by human authority, permissions, risk controls, approvals, traceability, and organizational operating model.",
);

export default function GovernedAiWorkforcePlatformsLayout({ children }: Readonly<{ children: ReactNode }>) {
  return children;
}
