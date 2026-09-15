import { NextResponse } from "next/server";
import { resolveOrganizationContext } from "@/lib/auth/organization-context";
import { createExecutionServiceClient } from "@/lib/integrations/service-runner";
import { getCanonicalSetupPlan } from "@/lib/integrations/connections/setup-plans";
import { getConnectionSetupBrowserView } from "@/lib/integrations/connection-setup-agent";

const ACTIVE = ["queued","starting","running","waiting_for_user","waiting_for_provider","verifying","paused","retrying"];

export async function GET(request: Request) {
  const context = await resolveOrganizationContext();
  if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const url = new URL(request.url);
  const requestedSessionId = url.searchParams.get("sessionId")?.trim() || "";

  let query = context.supabase.from("integration_setup_sessions")
    .select("id,project_id,connection_id,provider_key,session_status,current_step,control_mode,requires_user_action,user_action_type,human_takeover_reason,started_at,updated_at,browser_session_id,metadata")
    .eq("organization_id", context.organizationId)
    .eq("automation_mode", "ai");
  if (requestedSessionId) query = query.eq("id", requestedSessionId);
  else query = query.in("session_status", ACTIVE).order("created_at", { ascending: false }).limit(1);
  const sessionResult = await query.maybeSingle();
  const session = sessionResult.data;
  if (!session) return NextResponse.json({ session: null }, { headers: { "cache-control": "no-store" } });

  const [integrationResult, eventResult] = await Promise.all([
    context.supabase.from("organization_integrations").select("id,display_name,provider_key,status").eq("id", session.connection_id).eq("organization_id", context.organizationId).maybeSingle(),
    context.supabase.from("connection_setup_session_events").select("id,event_type,safe_message,created_at,status,step_key").eq("organization_id", context.organizationId).eq("session_id", session.id).order("created_at", { ascending: false }).limit(16),
  ]);
  const plan = getCanonicalSetupPlan(session.provider_key);
  const step = plan?.steps[Number(session.current_step)] ?? null;
  let browser = null;
  try {
    browser = await getConnectionSetupBrowserView(createExecutionServiceClient(), { organizationId: context.organizationId, sessionId: session.id });
  } catch {
    browser = null;
  }

  return NextResponse.json({
    session: {
      id: session.id,
      integrationId: session.connection_id,
      projectId: session.project_id,
      providerKey: session.provider_key,
      providerName: integrationResult.data?.display_name ?? plan?.title ?? session.provider_key,
      connectionStatus: integrationResult.data?.status ?? "setup_required",
      sessionStatus: session.session_status,
      currentStep: Number(session.current_step),
      totalSteps: plan?.steps.length ?? 0,
      controlMode: session.control_mode,
      requiresUserAction: Boolean(session.requires_user_action),
      userActionType: session.user_action_type,
      humanTakeoverReason: session.human_takeover_reason,
      startedAt: session.started_at,
      updatedAt: session.updated_at,
      browserSessionExists: Boolean(session.browser_session_id),
      step: step ? { stepKey: step.stepKey, title: step.title, description: step.description, risk: step.risk } : null,
      securityNote: plan?.securityNote ?? "Sensitive identity steps remain under Human control.",
      browser,
      events: eventResult.data ?? [],
    },
  }, { headers: { "cache-control": "no-store" } });
}
