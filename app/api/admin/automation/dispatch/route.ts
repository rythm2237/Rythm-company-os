import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { dispatchDueAutomationTasks } from "@/lib/admin/automation/executor";
import { pilotTraceHeaders, pilotTraceId, recordPilotSignal } from "@/lib/observability/pilot";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request) {
  const traceId = pilotTraceId();
  const headers = pilotTraceHeaders(traceId);
  const secret = process.env.CRON_SECRET?.trim();
  const authorization = request.headers.get("authorization");
  const provided = authorization?.startsWith("Bearer ") ? authorization.slice(7) : "";
  const providedBytes = Buffer.from(provided);
  const expectedBytes = Buffer.from(secret ?? "");
  if (!secret || providedBytes.length !== expectedBytes.length || !timingSafeEqual(providedBytes, expectedBytes)) {
    return NextResponse.json({ ok: false, error: "Unauthorized scheduler request." }, { status: 401, headers });
  }

  const started = Date.now();
  try {
    const results = await dispatchDueAutomationTasks();
    const failed = results.filter((result) => result.status === "failed").length;
    const skipped = results.filter((result) => result.status === "skipped").length;
    if (failed) recordPilotSignal({
      traceId, surface: "scheduler", severity: "P1", outcome: "degraded",
      code: "AUTOMATION_TASK_FAILURE", httpStatus: 503, durationMs: Date.now() - started,
    });
    return NextResponse.json(
      { ok: failed === 0, dispatched: results.length, failed, skipped },
      { status: failed ? 503 : 200, headers },
    );
  } catch {
    recordPilotSignal({
      traceId, surface: "scheduler", severity: "P0", outcome: "failed",
      code: "DISPATCH_UNAVAILABLE", httpStatus: 500, durationMs: Date.now() - started,
    });
    return NextResponse.json({ ok: false, error: "Automation dispatcher failed." }, { status: 500, headers });
  }
}
