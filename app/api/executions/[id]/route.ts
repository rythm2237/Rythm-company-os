import { NextResponse } from "next/server";
import { resolveOwnerApiOrganizationContext } from "@/lib/auth/api-organization-context";
import {
  executeApprovedToolRequest,
  rollbackToolExecution,
} from "@/lib/integrations/service-runner";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const context = await resolveOwnerApiOrganizationContext();
  if (!context.ok)
    return NextResponse.json(
      { ok: false, error: context.error },
      { status: context.status },
    );
  const { id } = await params;
  const { data: execution } = await context.supabase
    .from("tool_execution_requests")
    .select("id,status,organization_id")
    .eq("id", id)
    .eq("organization_id", context.organizationId)
    .maybeSingle();
  if (!execution)
    return NextResponse.json(
      { ok: false, error: "Execution was not found in this organization." },
      { status: 404 },
    );
  let body: { action?: string } = {};
  try {
    body = await request.json();
  } catch {}
  try {
    const result =
      body.action === "rollback"
        ? await rollbackToolExecution(id)
        : await executeApprovedToolRequest(id);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error ? error.message : "Execution action failed.",
      },
      { status: 409 },
    );
  }
}
