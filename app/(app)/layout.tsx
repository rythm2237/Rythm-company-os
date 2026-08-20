import type { Metadata } from "next";
import AppShell from "@/components/app-shell/AppShell";
import "../mobile-workspace.css";
import "../mobile-navigation-footer.css";
import "../workspace-form-hardening.css";
import "../communication-center.css";

export const metadata: Metadata = {
  title: "Company Workspace",
  robots: { index: false, follow: false },
};

export default function CompanyWorkspaceLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <AppShell>{children}</AppShell>;
}
