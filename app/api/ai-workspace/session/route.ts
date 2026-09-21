import { NextResponse } from "next/server";
import { createAuthServerClient } from "@/lib/supabase/auth-server";
import { ensurePersonalWorkspace, serviceClient, walletBalance } from "@/lib/ai-workspace/service";
import { resolveOrganizationContext } from "@/lib/auth/organization-context";

export const dynamic = "force-dynamic";

const catalog = [
  ["github","GitHub","Development"],["vercel","Vercel","Development"],["supabase","Supabase","Development"],
  ["gmail","Gmail","Productivity"],["google_drive","Google Drive","Productivity"],["google_calendar","Google Calendar","Productivity"],["outlook","Outlook","Productivity"],
  ["slack","Slack","Communication"],["microsoft_teams","Microsoft Teams","Communication"],
  ["notion","Notion","Data / Workspace"],["airtable","Airtable","Data / Workspace"],
  ["stripe","Stripe","Business"],["hubspot","HubSpot","Business"],
] as const;

export async function GET() {
  try {
    const auth = await createAuthServerClient();
    const { data: { user } } = await auth.auth.getUser();
    if (!user) return NextResponse.json({ error: "AUTH_REQUIRED" }, { status: 401 });
    const client = serviceClient();
    const personal = await ensurePersonalWorkspace(user.id, client);
    const balance = await walletBalance(personal.wallet.id, client);
    const org = await resolveOrganizationContext();
    const [conversationsResult, projectsResult, integrationsResult, providersResult] = await Promise.all([
      client.from("aiw_conversations").select("id,title,project_id,updated_at").eq("workspace_id", personal.workspace.id).eq("archived", false).order("updated_at", { ascending: false }).limit(50),
      client.from("aiw_projects").select("id,name,description").eq("workspace_id", personal.workspace.id).eq("archived", false).order("created_at"),
      org ? client.from("organization_integrations").select("provider_key,status,enabled").eq("organization_id", org.organizationId) : Promise.resolve({ data: [], error: null }),
      client.from("integration_providers").select("provider_key,enabled,setup_availability,kill_switch"),
    ]);
    const connected = new Map((integrationsResult.data ?? []).map((row: { provider_key: string; status: string; enabled: boolean }) => [row.provider_key, row]));
    const providers = new Map((providersResult.data ?? []).map((row: { provider_key: string; enabled: boolean; setup_availability: string; kill_switch: boolean }) => [row.provider_key, row]));
    const plugins = catalog.map(([key,name,category]) => {
      const connection = connected.get(key);
      const provider = providers.get(key);
      let status: "Connected" | "Available" | "Coming soon" | "Admin setup required" | "Disabled" = "Coming soon";
      if (connection?.enabled && connection.status === "connected") status = "Connected";
      else if (provider?.kill_switch || provider?.enabled === false) status = "Disabled";
      else if (provider?.enabled && provider.setup_availability === "available") status = "Available";
      else if (provider?.enabled && provider.setup_availability === "setup_available") status = "Admin setup required";
      else if (provider?.setup_availability === "coming_later") status = "Coming soon";
      else if (provider) status = "Admin setup required";
      return { key,name,category,status };
    });
    return NextResponse.json({
      user: { id: user.id, email: user.email ?? null }, workspace: personal.workspace, defaultProject: personal.project,
      projects: projectsResult.data ?? [], conversations: conversationsResult.data ?? [], balanceMicros: balance, currency: personal.wallet.currency,
      modes: personal.account.allowed_modes, promptProfiles: personal.account.allowed_prompt_profiles, maxRequestMicros: personal.account.max_request_micros,
      organization: org ? { id: org.organizationId, name: org.organization.name, role: org.role } : null, plugins,
    });
  } catch (error) {
    console.error("ai_workspace_session_failed", error);
    return NextResponse.json({ error: "AI_WORKSPACE_UNAVAILABLE" }, { status: 503 });
  }
}
