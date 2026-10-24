import { NextResponse } from "next/server";
import { resolveOwnerApiOrganizationContext } from "@/lib/auth/api-organization-context";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { assignProjectLead, loadProjectAgentCandidates, type AssignmentRequirements } from "@/lib/projects/project-agent-assignment";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const validId = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
export async function GET(request: Request) {
  const auth = await resolveOwnerApiOrganizationContext();
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  const query = new URL(request.url).searchParams; const projectId = query.get("projectId") || null;
  if (projectId) {
    if (!validId(projectId)) return NextResponse.json({ ok: false, error: "Invalid project identifier." }, { status: 400 });
    const owned = await auth.supabase.from("projects").select("id").eq("organization_id", auth.organizationId).eq("id", projectId).maybeSingle();
    if (!owned.data) return NextResponse.json({ ok: false, error: "Project not found." }, { status: 404 });
  }
  const service = createServerSupabaseClient();
  if (!service) return NextResponse.json({ ok: false, error: "Assignment service unavailable." }, { status: 503 });
  try {
    const requirements: AssignmentRequirements = { skills: (query.get("skills") || "").split(",").map(value => value.trim()).filter(Boolean).slice(0, 30), domain: query.get("domain")?.slice(0, 100) };
    const candidates = await loadProjectAgentCandidates(service, auth.organizationId, projectId, requirements);
    return NextResponse.json({ ok: true, candidates, recommendedAgentId: candidates.find(candidate => candidate.eligible)?.agentId ?? null });
  } catch (error) { return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Assignment unavailable." }, { status: 503 }); }
}
export async function POST(request: Request) {
  const auth = await resolveOwnerApiOrganizationContext();
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  let body: { projectId?: string; mode?: string; agentId?: string; skills?: string[]; domain?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ ok: false, error: "Invalid assignment request." }, { status: 400 }); }
  if (!validId(String(body.projectId)) || !["auto", "manual"].includes(String(body.mode)) || (body.mode === "manual" && !validId(String(body.agentId)))) return NextResponse.json({ ok: false, error: "Project, mode and manual agent selection must be valid." }, { status: 400 });
  const projectId = body.projectId!;
  const owned = await auth.supabase.from("projects").select("id").eq("organization_id", auth.organizationId).eq("id", projectId).maybeSingle();
  if (!owned.data) return NextResponse.json({ ok: false, error: "Project not found." }, { status: 404 });
  const service = createServerSupabaseClient();
  if (!service) return NextResponse.json({ ok: false, error: "Assignment service unavailable." }, { status: 503 });
  try {
    const decision = await assignProjectLead(service, auth.organizationId, projectId, auth.user.id, { mode: body.mode as "auto" | "manual", agentId: body.agentId, skills: Array.isArray(body.skills) ? body.skills.filter(value => typeof value === "string").slice(0, 30) : [], domain: typeof body.domain === "string" ? body.domain.slice(0, 100) : undefined });
    return NextResponse.json({ ok: decision.status === "assigned", ...decision }, { status: decision.status === "assigned" ? 200 : 409 });
  } catch (error) { return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Assignment failed." }, { status: 503 }); }
}
