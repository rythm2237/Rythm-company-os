import { NextResponse } from "next/server";
import { resolveOwnerApiOrganizationContext } from "@/lib/auth/api-organization-context";
import { requestToolExecution } from "@/lib/integrations/execution-gateway";
import { createExecutionServiceClient } from "@/lib/integrations/service-runner";

export const dynamic = "force-dynamic";

export async function GET() {
  const context = await resolveOwnerApiOrganizationContext();
  if (!context.ok)
    return NextResponse.json(
      { ok: false, error: context.error },
      { status: context.status },
    );
  const { data, error } = await context.supabase
    .from("tool_execution_requests")
    .select(
      "id,correlation_id,agent_id,integration_key,tool,capability_key,operation,target_ref,risk_level,authorization_result,approval_status,execution_mode,status,retry_count,verification_result,rollback_available,rollback_status,normalized_error_class,sanitized_error,created_at,completed_at",
    )
    .eq("organization_id", context.organizationId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error)
    return NextResponse.json(
      { ok: false, error: "Execution ledger could not be loaded." },
      { status: 500 },
    );
  return NextResponse.json(
    { ok: true, executions: data ?? [] },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request) {
  const context = await resolveOwnerApiOrganizationContext();
  if (!context.ok)
    return NextResponse.json(
      { ok: false, error: context.error },
      { status: context.status },
    );
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid request body." },
      { status: 400 },
    );
  }
  const integrationId = String(body.integrationId ?? "").trim(),
    capabilityKey = String(body.capabilityKey ?? "").trim();
  if (!integrationId || !capabilityKey)
    return NextResponse.json(
      { ok: false, error: "integrationId and capabilityKey are required." },
      { status: 400 },
    );
  try {
    const result = await requestToolExecution(createExecutionServiceClient(), {
      organizationId: context.organizationId,
      userId: context.user.id,
      agentId: body.agentId ? String(body.agentId) : null,
      integrationId,
      toolId: body.toolId ? String(body.toolId) : undefined,
      capabilityKey,
      operation: body.operation ? String(body.operation) : undefined,
      targetRef: body.target ? String(body.target) : null,
      input:
        body.input && typeof body.input === "object"
          ? (body.input as Record<string, unknown>)
          : {},
      originatingRequestId: body.originatingRequestId
        ? String(body.originatingRequestId)
        : null,
      projectId: body.projectId ? String(body.projectId) : null,
      meetingId: body.meetingId ? String(body.meetingId) : null,
      sessionId: body.sessionId ? String(body.sessionId) : null,
      intent: body.intent ? String(body.intent) : capabilityKey,
      requestedBy: body.agentId ? "agent" : "user",
      authoritySource:
        body.authoritySource === "boardroom"
          ? "boardroom"
          : body.authoritySource === "company_library"
            ? "company_library"
            : body.agentId
              ? "agent"
              : "human",
    });
    return NextResponse.json(
      { ok: true, ...result },
      { status: result.status === "waiting_approval" ? 202 : 200 },
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error ? error.message : "Execution proposal failed.",
      },
      { status: 400 },
    );
  }
}
