import { NextResponse } from "next/server";
import { pilotTraceHeaders, pilotTraceId, recordPilotSignal } from "@/lib/observability/pilot";

/**
 * W15 acceptance probe. No database/provider access and never enabled in production.
 * Preview deployments are protected with Vercel authentication in this project.
 * The branch gate also prevents unrelated previews from creating incident noise.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (
    process.env.VERCEL_ENV !== "preview" ||
    process.env.VERCEL_GIT_COMMIT_REF !== "pilot/w15-incident-observability"
  ) {
    return NextResponse.json({ error: "Not found" }, { status: 404, headers: { "Cache-Control": "no-store" } });
  }

  const traceId = pilotTraceId();
  recordPilotSignal({
    traceId,
    surface: "scheduler",
    severity: "P0",
    outcome: "failed",
    code: "SYNTHETIC_OUTAGE",
    httpStatus: 503,
    durationMs: 0,
  });
  return NextResponse.json(
    { ok: false, synthetic: true, traceId },
    { status: 503, headers: pilotTraceHeaders(traceId) },
  );
}
