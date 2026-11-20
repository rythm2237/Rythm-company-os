import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  calculatePilotErrorBudget, classifyPilotPath, PILOT_SLO_CANDIDATES,
  pilotSeverity, pilotTraceHeaders, pilotTraceId, recordPilotSignal,
} from "../lib/observability/pilot";

/** All of these are synthetic/offline: no emails, webhooks, DB writes, or customer data. */
const secretFixture = "sk_test_FAKE_NEVER_USE";
const fakeCustomer = "synthetic-person@example.invalid";
const fakeUrl = "/api/billing/webhook?token=secret";
const delivered: string[] = [];
const traceId = pilotTraceId();
const signal = recordPilotSignal({
  traceId, surface: "billing", severity: "P0", outcome: "failed",
  code: "SYNTHETIC_OUTAGE", httpStatus: 503, durationMs: 120,
  // Runtime payload must never spread unexpected user supplied fields.
  ...({ customerEmail: fakeCustomer, secret: secretFixture, url: fakeUrl } as object),
}, (line) => delivered.push(line));
assert.equal(delivered.length, 1, "synthetic collector received the event");
assert.equal(signal.event, "rythm_pilot_incident_v1");
assert.equal(signal.traceId, traceId);
assert.equal(Object.keys(JSON.parse(delivered[0])).length, 9, "strict 9-field allowlist");
assert.ok(["production","preview","development","local"].includes(signal.environment), "environment must be a fixed category, not user input");
const beforeEnvironment = process.env.VERCEL_ENV;
process.env.VERCEL_ENV = "preview";
const previewSignal = recordPilotSignal({
  traceId: pilotTraceId(), surface: "scheduler", severity: "P0",
  outcome: "failed", code: "SYNTHETIC_OUTAGE", httpStatus: 503,
}, () => {});
assert.equal(previewSignal.environment, "preview", "hosted preview must be identifiable");
if (beforeEnvironment === undefined) delete process.env.VERCEL_ENV;
else process.env.VERCEL_ENV = beforeEnvironment;
for (const token of [secretFixture, fakeCustomer, fakeUrl, "token", "customerEmail"])
  assert.ok(!delivered[0].includes(token), "untrusted field must never appear in log");
assert.equal(classifyPilotPath(fakeUrl), "billing");
assert.equal(classifyPilotPath("/api/meetings/private-customer-id"), "ai_tools");
assert.equal(classifyPilotPath("/auth/callback"), "auth");
assert.equal(classifyPilotPath("/api/projects/dispatch"), "background_jobs");
assert.equal(pilotSeverity("scheduler"), "P0");
assert.equal(pilotTraceHeaders(traceId)["X-Trace-Id"], traceId);
assert.equal(calculatePilotErrorBudget(null, null, 0.995), null, "no evidence => unknown");
assert.equal(calculatePilotErrorBudget(1000, 7, 0.995)?.exhausted, true);
assert.equal(calculatePilotErrorBudget(1000, 3, 0.995)?.remainingFailures, 2);
assert.equal(PILOT_SLO_CANDIDATES.length, 7);
for (const candidate of PILOT_SLO_CANDIDATES) {
  assert.equal(candidate.windowDays, 30);
  assert.ok(candidate.target >= 0.99 && candidate.target <= 0.995);
}
// Tabletop: fake outage -> P0 triage -> simulated acknowledgement -> simulated containment.
// This deliberately does not claim real external transport or paging.
const triage = { detected: signal.severity === "P0", acknowledged: false, contained: false };
assert.equal(triage.detected, true);
triage.acknowledged = true;
triage.contained = true;
assert.equal(triage.acknowledged && triage.contained, true);
const dispatcher = readFileSync("app/api/admin/automation/dispatch/route.ts", "utf8");
const incidentPage = readFileSync("app/(app)/operations/health/page.tsx", "utf8");
const instrumentation = readFileSync("instrumentation.ts", "utf8");
assert.ok(dispatcher.includes("pilotTraceHeaders(traceId)"));
assert.ok(dispatcher.includes('status: failed ? 503 : 200'));
assert.ok(incidentPage.includes("PILOT_SLO_CANDIDATES"), "owner incident dashboard exposes measurement gaps");
assert.ok(instrumentation.includes("onRequestError"), "unhandled server errors instrumented");
const signup = readFileSync("app/(auth)/signup/actions.ts", "utf8");
const onboarding = readFileSync("app/(auth)/setup/company/actions.ts", "utf8");
const callback = readFileSync("app/(auth)/auth/callback/route.ts", "utf8");
const webhook = readFileSync("app/api/billing/webhook/route.ts", "utf8");
const aiChat = readFileSync("app/api/ai-workspace/chat/route.ts", "utf8");
assert.ok(!signup.includes("message: error.message"), "signup should not print raw provider messages");
assert.ok(!onboarding.includes("userId: user.id, error"), "onboarding should not log user details/errors");
assert.ok(!callback.includes("message: userError"), "auth callback should not log auth provider text");
assert.ok(webhook.includes('code:"BILLING_RUNTIME_FAILURE"'), "billing failures emit safe P0 signals");
assert.ok(aiChat.includes('code:"AI_RUNTIME_FAILURE"'), "AI tool failure emits safe event");
assert.ok(!instrumentation.includes("JSON.stringify(_err)"), "exception contents never logged by new instrumentation");
const syntheticRoute = readFileSync("app/api/internal/w15/synthetic-outage/route.ts", "utf8");
assert.ok(syntheticRoute.includes('process.env.VERCEL_ENV !== "preview"'), "must never run in Production");
assert.ok(syntheticRoute.includes('process.env.VERCEL_GIT_COMMIT_REF !== "pilot/w15-incident-observability"'), "branch locked");
assert.ok(syntheticRoute.includes('code: "SYNTHETIC_OUTAGE"'), "fixed safe signal");
assert.ok(syntheticRoute.includes("status: 503"), "injected synthetic service failure");
assert.ok(!/(serviceClient|createServerSupabaseClient|fetch\()/.test(syntheticRoute), "probe must have no database or network calls");
const projectDispatch = readFileSync("app/api/projects/dispatch/route.ts", "utf8");
const healthRoute = readFileSync("app/api/health/route.ts", "utf8");
assert.ok(projectDispatch.includes('surface:"background_jobs",severity:"P0"'), "hard dispatch failures must emit fixed P0 signal");
assert.ok(projectDispatch.includes('surface:"background_jobs",severity:"P1"'), "partial dispatch failures must emit P1 signal");
assert.ok(healthRoute.includes('code:"CONFIGURATION_UNAVAILABLE"'), "critical readiness failures must emit P0");
assert.ok(healthRoute.includes("pilotTraceHeaders(traceId)"), "health failure provides matching trace header");
console.log("W15 OFFLINE PASS: P0 synthetic collector, 9-field environment-scoped redaction, SLO budget, routing, dispatcher instrumentation and tabletop.");
console.log("W15 NOTICE: synthetic collector is not proof of provider alert delivery or hosted staging outage.");
