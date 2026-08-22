import type { Metadata } from "next";
import AppShell from "@/components/app-shell/AppShell";
import CommunicationDeliveryDock from "@/components/communication/CommunicationDeliveryDock";
import "../mobile-workspace.css";
import "../mobile-navigation-footer.css";
import "../workspace-form-hardening.css";
import "../communication-center.css";
import "../native-mailbox.css";
import "../company-operations.css";

export const metadata: Metadata = {
  title: "Company Workspace",
  robots: { index: false, follow: false },
};

export default function CompanyWorkspaceLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <AppShell>
      {children}
      <CommunicationDeliveryDock />
    </AppShell>
  );
}
