import { after, NextResponse } from "next/server";
import { resolveOwnerApiOrganizationContext } from "@/lib/auth/api-organization-context";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function resolveSession(request: Request, meetingId: string) {
  const auth = await resolveOwnerApiOrganizationContext();
  if (!auth.ok) return { ok: false as const, response: NextResponse.json({ ok: false, error: auth.error }, { status: auth.status }) };
  const { data: meeting } = await auth.supabase.from("meetings")
    .select("id,status")
    .eq("id", meetingId)
    .eq("organization_id", auth.organizationId)
    .maybeSingle();
  if (!meeting) return { ok: false as const, response: NextResponse.json({ ok: false, error: "Meeting not found." }, { status: 404 }) };
  const { data: session } = await auth.supabase.from("meeting_agent_sessions")
    .select("id,status")
    .eq("meeting_id", meetingId)
    .eq("organization_id", auth.organizationId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return { ok: true as const, meeting, session };
}

export async function GET(request: Request) {
  const meetingId = new URL(request.url).searchParams.get("meeting")?.trim() ?? "";
  if (!meetingId) return NextResponse.json({ ok: false, error: "meeting is required." }, { status: 400 });
  const resolved = await resolveSession(request, meetingId);
  if (!resolved.ok) return resolved.response;
  return NextResponse.json({ ok: true, meetingStatus: resolved.meeting.status, sessionId: resolved.session?.id ?? null, sessionStatus: resolved.session?.status ?? null });
}

export async function POST(request: Request) {
  let meetingId = "";
  try { meetingId = String(((await request.json()) as { meetingId?: string }).meetingId ?? "").trim(); }
  catch { return NextResponse.json({ ok: false, error: "A JSON body with meetingId is required." }, { status: 400 }); }
  if (!meetingId) return NextResponse.json({ ok: false, error: "meetingId is required." }, { status: 400 });

  const resolved = await resolveSession(request, meetingId);
  if (!resolved.ok) return resolved.response;
  const sessionId = resolved.session?.id ?? "";
  if (!sessionId || !["ready", "running"].includes(String(resolved.session?.status ?? ""))) {
    return NextResponse.json({ ok: true, meetingId, sessionId: sessionId || null, detached: false, reason: "No active deliberation requires continuation." });
  }

  const origin = new URL(request.url).origin;
  const cookie = request.headers.get("cookie") ?? "";

  after(async () => {
    await sleep(1400);
    for (let step = 0; step < 40; step += 1) {
      try {
        const response = await fetch(`${origin}/api/meetings/deliberate`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json", cookie },
          cache: "no-store",
          body: JSON.stringify({ sessionId }),
        });
        const raw = await response.text();
        let payload: Record<string, unknown> = {};
        try { payload = raw ? JSON.parse(raw) as Record<string, unknown> : {}; } catch {}
        if (response.ok && payload.ok === true) {
          if (payload.status === "completed") return;
          await sleep(700);
          continue;
        }
        if (response.status === 409 && /complete|synthesis/i.test(String(payload.error ?? ""))) return;
        console.error("meeting_detached_continuation_stopped", { meetingId, sessionId, step, status: response.status, error: payload.error ?? raw.slice(0, 240) });
        return;
      } catch (error) {
        console.error("meeting_detached_continuation_failed", { meetingId, sessionId, step, error: error instanceof Error ? error.message : String(error) });
        return;
      }
    }
  });

  return NextResponse.json({ ok: true, meetingId, sessionId, detached: true });
}
