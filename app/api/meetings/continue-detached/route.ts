import { after, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function POST(request: Request) {
  let sessionId = "";
  try {
    sessionId = String(((await request.json()) as { sessionId?: string }).sessionId ?? "").trim();
  } catch {
    return NextResponse.json({ ok: false, error: "A JSON body with sessionId is required." }, { status: 400 });
  }
  if (!sessionId) return NextResponse.json({ ok: false, error: "sessionId is required." }, { status: 400 });

  const origin = new URL(request.url).origin;
  const cookie = request.headers.get("cookie") ?? "";

  after(async () => {
    await sleep(1200);
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
          await sleep(650);
          continue;
        }

        if (response.status === 409 && /complete|synthesis/i.test(String(payload.error ?? ""))) return;
        console.error("meeting_detached_continuation_stopped", { sessionId, step, status: response.status, error: payload.error ?? raw.slice(0, 240) });
        return;
      } catch (error) {
        console.error("meeting_detached_continuation_failed", { sessionId, step, error: error instanceof Error ? error.message : String(error) });
        return;
      }
    }
  });

  return NextResponse.json({ ok: true, sessionId, detached: true });
}
