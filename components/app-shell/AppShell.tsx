import Link from "next/link";
import { Suspense } from "react";
import DecisionDraftGuard from "@/components/decision-draft-guard/DecisionDraftGuard";
import ProductNav from "@/components/product-nav/ProductNav";
import ProjectPulse from "@/components/project-pulse/ProjectPulse";
import BoardroomFocusBridge from "@/components/app-shell/BoardroomFocusBridge";
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

const footerGroups = [
  { label: "Workspace", links: [["Command", "/command-center"], ["Projects", "/projects"], ["Agent Studio", "/studio/agents"], ["Boardroom", "/meetings/room"]] },
  { label: "Trust", links: [["Security", "/security"], ["Trust center", "/trust"], ["AI transparency", "/ai-transparency"], ["Subprocessors", "/subprocessors"]] },
  { label: "Legal", links: [["Privacy", "/privacy"], ["Terms", "/terms"], ["DPA", "/dpa"], ["Data requests", "/data-requests"]] },
  { label: "Help", links: [["Support", "/support"], ["Contact", "/contact"], ["Workspace guide", "/onboarding"]] },
] as const;

export default async function AppShell({ children }: Readonly<{ children: React.ReactNode }>) {
  let pulseEvent = null;
  let pulseNodes: PulseNode[] = [];
  let pulseProject = null;
  let organizationContext: Awaited<ReturnType<typeof resolveOrganizationContext>> = null;
  let companyLaunchVisible = false;

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
          supabase.from("project_progress_nodes").select("stage_code,label,sequence_no,weight_percent,node_type").eq("project_id", event.project_id).order("sequence_no"),
          supabase.from("projects").select("project_code,name").eq("organization_id", organizationId).eq("id", event.project_id).maybeSingle(),
        ]);
        pulseEvent = event;
        pulseNodes = (nodesResult.data ?? []) as PulseNode[];
        pulseProject = projectResult.data;
      }

      if (organizationContext.entitlement?.product_code === "ready_company") {
        companyLaunchVisible = true;
        try {
          const [orgResult, knowledgeResult, legalResult, integrationsResult, agentsResult, projectsResult, meetingsResult] = await Promise.all([
            supabase.from("organizations").select("name,mission,vision").eq("id", organizationId).single(),
            supabase.from("company_knowledge").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).eq("status", "active").eq("ingestion_status", "ready"),
            supabase.from("company_knowledge").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).eq("category", "legal").eq("status", "active").eq("ingestion_status", "ready"),
            supabase.from("organization_integrations").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).eq("status", "connected"),
            supabase.from("agents").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).eq("enabled", true),
            supabase.from("projects").select("id", { count: "exact", head: true }).eq("organization_id", organizationId),
            supabase.from("meetings").select("id", { count: "exact", head: true }).eq("organization_id", organizationId),
          ]);
          const org = orgResult.data;
          const complete = Boolean(org?.name && org?.mission && org?.vision)
            && (knowledgeResult.count ?? 0) > 0
            && (legalResult.count ?? 0) > 0
            && (integrationsResult.count ?? 0) > 0
            && (agentsResult.count ?? 0) > 0
            && (projectsResult.count ?? 0) > 0
            && (meetingsResult.count ?? 0) > 0;
          companyLaunchVisible = !complete;
        } catch {
          companyLaunchVisible = true;
        }
      }
    }
  } catch {
    // App chrome remains available while tenant context or optional Pulse/readiness data is unavailable.
  }

  const commercialAccess = isOrganizationEntitlementActive(organizationContext?.entitlement);
  const navigationAccess = {
    active: commercialAccess,
    agentStudio: Boolean(commercialAccess && organizationContext?.entitlement?.agent_builder_enabled),
    templates: Boolean(commercialAccess && organizationContext?.entitlement?.company_template_access),
    companyBuilder: Boolean(commercialAccess && organizationContext?.entitlement?.company_builder_enabled),
    companyLaunch: Boolean(commercialAccess && companyLaunchVisible),
  };

  const organizationNavigation = organizationContext ? {
    activeOrganizationId: organizationContext.organizationId,
    activeOrganizationName: organizationContext.organization.name,
    activeRole: organizationContext.role,
    productCode: organizationContext.entitlement?.product_code,
    entitlementStatus: organizationContext.entitlement?.status,
    organizations: organizationContext.memberships.map((membership) => ({ id: membership.organization_id, name: membership.organization.name, role: membership.role })),
  } : null;

  return (
    <div className="app-workspace">
      <ProductNav access={navigationAccess} organization={organizationNavigation} />
      <Suspense fallback={null}><BoardroomFocusBridge /></Suspense>
      <Suspense fallback={null}><DecisionDraftGuard /></Suspense>
      <div className="app-stage">
        <div className="app-page-transition">{children}</div>
        <footer className="workspace-footer" aria-label="RYTHM workspace footer">
          <div className="workspace-footer-inner">
            <div className="workspace-footer-brand"><strong>RYTHM Company OS</strong><span>Human-led AI company operating system.</span></div>
            <nav className="workspace-footer-links" aria-label="Footer navigation">
              {footerGroups.map((group) => <section className="workspace-footer-group" key={group.label}><h2>{group.label}</h2><div>{group.links.map(([label, href]) => <Link href={href} key={href}>{label}</Link>)}</div></section>)}
            </nav>
          </div>
          <div className="workspace-footer-bottom"><span>© 2026 RYTHM Company OS</span><span>Human authority · tenant isolation · governed AI</span></div>
        </footer>
      </div>
      <Suspense fallback={null}><ProjectPulse event={pulseEvent} nodes={pulseNodes} project={pulseProject} /></Suspense>
    </div>
  );
}
