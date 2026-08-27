import type { ReactNode } from "react";
import { GoogleWorkspaceFormEnhancer } from "./google-workspace-form-enhancer";

export default function IntegrationsLayout({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <GoogleWorkspaceFormEnhancer />
    </>
  );
}
