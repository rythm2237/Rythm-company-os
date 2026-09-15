import type { Metadata } from "next";
import AppShell from "@/components/app-shell/AppShell";
import CommunicationDeliveryDock from "@/components/communication/CommunicationDeliveryDock";
import ConnectionAgentDock from "@/components/integrations/ConnectionAgentDock";
import GoogleWorkspaceConnectEnhancer from "@/components/integrations/GoogleWorkspaceConnectEnhancer";
import ActiveWorkspaceGuide from "@/components/onboarding/ActiveWorkspaceGuide";
import ProjectExecutiveSignalEnhancer from "@/components/projects/ProjectExecutiveSignalEnhancer";
import "../mobile-workspace.css";
import "../mobile-navigation-footer.css";
import "../workspace-form-hardening.css";
import "../communication-center.css";
import "../native-mailbox.css";
import "../company-operations.css";
import "../finance-center.css";
import "../crm-center.css";
import "../admin-studio.css";
import "../connection-flight-deck.css";

export const metadata: Metadata = {
  title: "Company Workspace",
  robots: { index: false, follow: false },
};

export default function CompanyWorkspaceLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <AppShell>
      {children}
      <ConnectionAgentDock />
      <CommunicationDeliveryDock />
      <GoogleWorkspaceConnectEnhancer />
      <ActiveWorkspaceGuide />
      <ProjectExecutiveSignalEnhancer />
    </AppShell>
  );
}
