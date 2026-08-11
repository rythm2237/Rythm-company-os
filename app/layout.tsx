import type { Metadata } from "next";
import { Suspense } from "react";
import "./globals.css";
import "./experience.css";
import "./project-portfolio.css";
import ProjectPulse from "@/components/project-pulse/ProjectPulse";
import ProductNav from "@/components/product-nav/ProductNav";
import OrganizationSwitcher from "@/components/organization-switcher/OrganizationSwitcher";
import DecisionDraftGuard from "@/components/decision-draft-guard/DecisionDraftGuard";
import { resolveOrganizationContext } from "@/lib/auth/organization-context";

export const metadata: Metadata = {
  title: "RYTHM Company OS",
  description: "AI-native company operating system",
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  let pulseEvent = null;
  let pulseNodes: Array<{stage_code:string;label:string;sequence_no:number;weight_percent:number;node_type:string}> = [];
  let pulseProject = null;
  let organizationContext: Awaited<ReturnType<typeof resolveOrganizationContext>> = null;

  try {
    organizationContext = await resolveOrganizationContext();
    if (organizationContext) {
      const { supabase, organizationId } = organizationContext;
      const { data: event } = await supabase.from("project_progress_events")
        .select("id,project_id,event_type,event_label,previous_progress,new_progress,previous_node,new_node,event_state,next_step,created_at")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (event) {
        const [nodesResult, projectResult] = await Promise.all([
          supabase.from("project_progress_nodes")
            .select("stage_code,label,sequence_no,weight_percent,node_type")
            .eq("project_id", event.project_id).order("sequence_no"),
          supabase.from("projects")
            .select("project_code,name")
            .eq("organization_id", organizationId)
            .eq("id", event.project_id).maybeSingle(),
        ]);
        pulseEvent = event;
        pulseNodes = nodesResult.data ?? [];
        pulseProject = projectResult.data;
      }
    }
  } catch {
    // Tenant context/Pulse are progressive enhancement for unauthenticated and pre-migration surfaces.
  }

  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#main-content">Skip to main content</a>
        <ProductNav />
        {organizationContext ? (
          <OrganizationSwitcher
            activeOrganizationId={organizationContext.organizationId}
            activeOrganizationName={organizationContext.organization.name}
            activeRole={organizationContext.role}
            productCode={organizationContext.entitlement?.product_code}
            entitlementStatus={organizationContext.entitlement?.status}
            organizations={organizationContext.memberships.map((membership) => ({
              id: membership.organization_id,
              name: membership.organization.name,
              role: membership.role,
            }))}
          />
        ) : null}
        <Suspense fallback={null}><DecisionDraftGuard /></Suspense>
        <div id="main-content">{children}</div>
        <Suspense fallback={null}><ProjectPulse event={pulseEvent} nodes={pulseNodes} project={pulseProject} /></Suspense>
      </body>
    </html>
  );
}
