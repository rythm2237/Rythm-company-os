import type { ReactNode } from "react";
import { createStandalonePublicMetadata } from "@/lib/seo/standalone-metadata";

export const metadata = createStandalonePublicMetadata(
  "/virtual-company-ai-employees",
  "Virtual Company with AI Employees",
  "A direct guide to software for running a virtual company with AI employees, including roles, shared context, collaboration, human authority, approvals, and governed execution.",
);

export default function VirtualCompanyAiEmployeesLayout({ children }: Readonly<{ children: ReactNode }>) {
  return children;
}
