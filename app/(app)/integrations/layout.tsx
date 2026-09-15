import type { ReactNode } from "react";
import "./integration-guide.css";
import { GoogleWorkspaceFormEnhancer } from "./google-workspace-form-enhancer";
import { IntegrationSetupGuide } from "./integration-setup-guide";

export default function IntegrationsLayout({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <GoogleWorkspaceFormEnhancer />
      <IntegrationSetupGuide />
    </>
  );
}
