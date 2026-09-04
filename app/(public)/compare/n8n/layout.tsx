import type { ReactNode } from "react";
import { createStandalonePublicMetadata } from "@/lib/seo/standalone-metadata";

export const metadata = createStandalonePublicMetadata(
  "/compare/n8n",
  "RYTHM Company OS vs n8n",
  "Compare RYTHM's governed AI company operating model with n8n's workflow automation and AI Agent platform using official n8n sources.",
);

export default function N8nComparisonLayout({ children }: Readonly<{ children: ReactNode }>) {
  return children;
}
