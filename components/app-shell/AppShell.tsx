import { Suspense } from "react";
import DecisionDraftGuard from "@/components/decision-draft-guard/DecisionDraftGuard";
import ProductNav from "@/components/product-nav/ProductNav";
import ProjectPulse from "@/components/project-pulse/ProjectPulse";
import {
  isOrganizationEntitlementActive,
  resolveOrganizationContext,
} from "@/lib/auth/organization-context";

type PulseNode = {
  stage_code: string;
  label: string;
  sequence_no: number;
  weight_percent: number;
  node_type: string;
};

export default async function AppShell({ children }: Readonly<{ children: React.ReactNode }>) {
  let pulseEvent = null;
  let pulseNodes: PulseNode[] = [];
  let pulseProject = null;
  let organizationContext: Awaited<ReturnType<typeof resolveOrganizationContext>> = null;

  try {
    organizationContext = await resolveOrganizationContext();
    if (organizationContext) {
      const { supabase, organizationId } = organizationContext;
      const { data: event } = await supabase
        .from("project_progress_events")
        .select("id,project_id,event_type,event_label,previous_progress,new_progress,previous_node,new_node,event_state,next_step,created_at")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (event) {
        const [nodesResult, projectResult] = await Promise.all([
          supabase
            .from("project_progress_nodes")
            .select("stage_code,label,sequence_no,weight_percent,node_type")
            .eq("project_id", event.project_id)
            .order("sequence_no"),
          supabase
            .from("projects")
            .select("project_code,name")
            .eq("organization_id", organizationId)
            .eq("id", event.project_id)
            .maybeSingle(),
        ]);
        pulseEvent = event;
        pulseNodes = (nodesResult.data ?? []) as PulseNode[];
        pulseProject = projectResult.data;
      }
    }
  } catch {
    // App chrome remains available while tenant context or optional Pulse data is unavailable.
  }

  const commercialAccess = isOrganizationEntitlementActive(organizationContext?.entitlement);
  const navigationAccess = {
    active: commercialAccess,
    agentStudio: Boolean(commercialAccess && organizationContext?.entitlement?.agent_builder_enabled),
    templates: Boolean(commercialAccess && organizationContext?.entitlement?.company_template_access),
    companyBuilder: Boolean(commercialAccess && organizationContext?.entitlement?.company_builder_enabled),
  };

  const organizationNavigation = organizationContext ? {
    activeOrganizationId: organizationContext.organizationId,
    activeOrganizationName: organizationContext.organization.name,
    activeRole: organizationContext.role,
    productCode: organizationContext.entitlement?.product_code,
    entitlementStatus: organizationContext.entitlement?.status,
    organizations: organizationContext.memberships.map((membership) => ({
      id: membership.organization_id,
      name: membership.organization.name,
      role: membership.role,
    })),
  } : null;

  return (
    <div className="app-workspace">
      <ProductNav access={navigationAccess} organization={organizationNavigation} />
      <Suspense fallback={null}><DecisionDraftGuard /></Suspense>
      <div className="app-stage"><div className="app-page-transition">{children}</div></div>
      <Suspense fallback={null}>
        <ProjectPulse event={pulseEvent} nodes={pulseNodes} project={pulseProject} />
      </Suspense>
    </div>
  );
}
