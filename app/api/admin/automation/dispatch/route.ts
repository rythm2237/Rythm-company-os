import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { dispatchDueAutomationTasks } from "@/lib/admin/automation/executor";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  const authorization = request.headers.get("authorization");
  const provided = authorization?.startsWith("Bearer ") ? authorization.slice(7) : "";
  const providedBytes = Buffer.from(provided);
  const expectedBytes = Buffer.from(secret ?? "");
  if (!secret || providedBytes.length !== expectedBytes.length || !timingSafeEqual(providedBytes, expectedBytes)) {
    return NextResponse.json({ ok: false, error: "Unauthorized scheduler request." }, { status: 401 });
  }

  try {
    const results = await dispatchDueAutomationTasks();
    return NextResponse.json({ ok: true, dispatched: results.length, failed: results.filter((result) => "status" in result && result.status === "failed").length }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    console.error("automation_dispatch_failed");
    return NextResponse.json({ ok: false, error: "Automation dispatcher failed." }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
