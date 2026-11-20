/**
 * W15 pilot observability. Never accept request content, user identifiers,
 * exception messages, URLs, headers, tokens or tenant IDs as log dimensions.
 * Collection is not notification delivery; alert transport is a separate gate.
 */
import { randomUUID } from "node:crypto";

export type PilotSurface =
  | "core_routes" | "auth" | "onboarding" | "billing" | "ai_tools"
  | "scheduler" | "background_jobs" | "unknown";
export type PilotSeverity = "P0" | "P1" | "P2";
export type PilotOutcome = "failed" | "degraded" | "recovered";
export type PilotSignalCode =
  | "UNHANDLED_EXCEPTION" | "DISPATCH_UNAVAILABLE" | "AUTOMATION_TASK_FAILURE"
  | "CONFIGURATION_UNAVAILABLE" | "SYNTHETIC_OUTAGE" | "UPSTREAM_UNAVAILABLE"
  | "BILLING_RUNTIME_FAILURE" | "AUTH_RUNTIME_FAILURE" | "AI_RUNTIME_FAILURE";

export type PilotSignal = Readonly<{
  event: "rythm_pilot_incident_v1";
  traceId: string;
  surface: PilotSurface;
  severity: PilotSeverity;
  outcome: PilotOutcome;
  code: PilotSignalCode;
  httpStatus: number | null;
  durationMs: number | null;
}>;

export type PilotSloCandidate = Readonly<{
  surface: Exclude<PilotSurface, "unknown">;
  target: number;
  windowDays: 30;
  measurement: "request_success";
}>;

/** Planning targets only; NOT agreed customer SLA or measured uptime. */
export const PILOT_SLO_CANDIDATES: readonly PilotSloCandidate[] = [
  { surface: "core_routes", target: 0.995, windowDays: 30, measurement: "request_success" },
  { surface: "auth", target: 0.995, windowDays: 30, measurement: "request_success" },
  { surface: "onboarding", target: 0.99, windowDays: 30, measurement: "request_success" },
  { surface: "billing", target: 0.995, windowDays: 30, measurement: "request_success" },
  { surface: "ai_tools", target: 0.99, windowDays: 30, measurement: "request_success" },
  { surface: "scheduler", target: 0.995, windowDays: 30, measurement: "request_success" },
  { surface: "background_jobs", target: 0.995, windowDays: 30, measurement: "request_success" },
] as const;

export function pilotTraceId(): string {
  return randomUUID();
}

export function pilotTraceHeaders(traceId: string): Record<string, string> {
  return { "Cache-Control": "no-store", "X-Trace-Id": traceId };
}

/** Returns null instead of inventing an SLO from incomplete samples. */
export function calculatePilotErrorBudget(
  requests: number | null,
  failures: number | null,
  target: number,
): Readonly<{ allowedFailures: number; remainingFailures: number; observedSuccessRate: number; exhausted: boolean }> | null {
  if (requests === null || failures === null || !Number.isSafeInteger(requests) ||
      !Number.isSafeInteger(failures) || requests <= 0 || failures < 0 ||
      failures > requests || !Number.isFinite(target) || target <= 0 || target >= 1) return null;
  const allowedFailures = Math.floor(requests * (1 - target) + 1e-9);
  return {
    allowedFailures,
    remainingFailures: allowedFailures - failures,
    observedSuccessRate: (requests - failures) / requests,
    exhausted: failures > allowedFailures,
  };
}

/**
 * The argument type only permits fixed categories and whitelisted codes.
 * Runtime validation additionally discards any untrusted extension fields.
 */
export function recordPilotSignal(
  input: Pick<PilotSignal, "traceId" | "surface" | "severity" | "outcome" | "code"> &
    { httpStatus?: number; durationMs?: number },
  sink: (line: string) => void = (line) => console.error(line),
): PilotSignal {
  const validSurfaces: readonly PilotSurface[] = ["core_routes", "auth", "onboarding", "billing", "ai_tools", "scheduler", "background_jobs", "unknown"];
  const validSeverities: readonly PilotSeverity[] = ["P0", "P1", "P2"];
  const validOutcomes: readonly PilotOutcome[] = ["failed", "degraded", "recovered"];
  const validCodes: readonly PilotSignalCode[] = ["UNHANDLED_EXCEPTION", "DISPATCH_UNAVAILABLE", "AUTOMATION_TASK_FAILURE", "CONFIGURATION_UNAVAILABLE", "SYNTHETIC_OUTAGE", "UPSTREAM_UNAVAILABLE", "BILLING_RUNTIME_FAILURE", "AUTH_RUNTIME_FAILURE", "AI_RUNTIME_FAILURE"];
  const signal: PilotSignal = {
    event: "rythm_pilot_incident_v1",
    traceId: /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.traceId) ? input.traceId : pilotTraceId(),
    surface: validSurfaces.includes(input.surface) ? input.surface : "unknown",
    severity: validSeverities.includes(input.severity) ? input.severity : "P2",
    outcome: validOutcomes.includes(input.outcome) ? input.outcome : "failed",
    code: validCodes.includes(input.code) ? input.code : "UNHANDLED_EXCEPTION",
    httpStatus: Number.isInteger(input.httpStatus) && Number(input.httpStatus) >= 100 && Number(input.httpStatus) <= 599 ? Number(input.httpStatus) : null,
    durationMs: Number.isFinite(input.durationMs) && Number(input.durationMs) >= 0 ? Math.min(Math.round(Number(input.durationMs)), 300000) : null,
  };
  sink(JSON.stringify(signal));
  return signal;
}

/** Fixed route families only; dynamic route segments never reach the log. */
export function classifyPilotPath(path: string): PilotSurface {
  if (path.startsWith("/api/billing/") || path.startsWith("/billing")) return "billing";
  if (path.startsWith("/api/ai-workspace/") || path.startsWith("/api/meetings/")) return "ai_tools";
  if (path.startsWith("/api/admin/automation/dispatch")) return "scheduler";
  if (path.startsWith("/api/projects/dispatch")) return "background_jobs";
  if (path.startsWith("/api/")) return "core_routes";
  if (path.startsWith("/auth/") || path.startsWith("/login") || path.startsWith("/signup") || path.startsWith("/reset-password")) return "auth";
  if (path.startsWith("/onboarding") || path.startsWith("/setup/company")) return "onboarding";
  return "unknown";
}

export function pilotSeverity(surface: PilotSurface): PilotSeverity {
  if (surface === "billing" || surface === "auth" || surface === "scheduler" || surface === "background_jobs") return "P0";
  if (surface === "core_routes" || surface === "onboarding" || surface === "ai_tools") return "P1";
  return "P2";
}
