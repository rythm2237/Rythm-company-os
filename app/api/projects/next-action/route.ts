import { NextResponse } from "next/server";
import { resolveOwnerApiOrganizationContext } from "@/lib/auth/api-organization-context";
import { loadProjectNextAction } from "@/lib/projects/project-next-action";

export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const auth = await resolveOwnerApiOrganizationContext();
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  const projectId = new URL(request.url).searchParams.get("projectId")?.trim();
  if (!projectId) return NextResponse.json({ ok: false, error: "projectId is required." }, { status: 400 });
  try {
    const nextAction = await loadProjectNextAction(auth.supabase, auth.organizationId, projectId);
    return NextResponse.json({ ok: true, nextAction }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Project guidance is unavailable." }, { status: 503 });
  }
}
