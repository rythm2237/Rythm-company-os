import assert from "node:assert/strict";
import { pilotTraceId, recordPilotSignal } from "../lib/observability/pilot";
import { deliverPilotP0Alert } from "../lib/observability/p0-alert-mailer";

async function main() {
const env: NodeJS.ProcessEnv = {
  VERCEL_ENV: "preview",
  VERCEL_GIT_COMMIT_REF: "pilot/w15-incident-observability",
  RYTHM_P0_ALERT_EMAIL_ENABLED: "true",
  RYTHM_P0_SYNTHETIC_TEST_EMAIL_ENABLED: "true",
  RYTHM_P0_ALERT_FROM: "alerts@rythm-os.com",
  RYTHM_P0_ALERT_PRIMARY_EMAIL: "primary@example.invalid",
  RYTHM_P0_ALERT_BACKUP_EMAIL: "backup@example.invalid",
  RESEND_API_KEY: "re_TEST_ONLY_NOT_A_REAL_KEY",
};
const event = { ...recordPilotSignal({
  traceId: pilotTraceId(), surface: "scheduler", severity: "P0",
  outcome: "failed", code: "SYNTHETIC_OUTAGE", httpStatus: 503,
}, () => {}), environment: "preview" as const };
const posts: { url: string; headers: Record<string, string>; body: Record<string, unknown> }[] = [];
const logs: string[] = [];
const ok = async (url: string, init: RequestInit): Promise<Response> => {
  posts.push({ url, headers: init.headers as Record<string,string>, body: JSON.parse(String(init.body)) as Record<string, unknown> });
  return Response.json({ id: "fake-receipt" });
};
const result = await deliverPilotP0Alert(event, { env, fetcher: ok, now: 0, sink: line => logs.push(line) });
assert.deepEqual(result, { state: "accepted", primary: "accepted", backup: "accepted" });
assert.equal(posts.length, 2);
assert.ok(posts.every(x => x.url === "https://api.resend.com/emails"));
assert.deepEqual(posts.map(x => (x.body.to as string[])[0]).sort(), ["backup@example.invalid","primary@example.invalid"]);
assert.equal(new Set(posts.map(x => x.headers["Idempotency-Key"])).size, 2);
assert.ok(posts.every(x => !JSON.stringify(x.body).includes(event.traceId)), "mail payload must be identical within window");
assert.equal(logs.length, 1);
assert.deepEqual(Object.keys(JSON.parse(logs[0])).sort(), ["event","environment","surface","code","windowStart","primary","backup"].sort());
for (const forbidden of ["primary@example.invalid","backup@example.invalid",env.RESEND_API_KEY!,event.traceId])
  assert.ok(!logs[0].includes(forbidden), "safe metadata logs must not expose addresses, keys or traces");
const before = posts.length;
assert.equal((await deliverPilotP0Alert(event, { env: { ...env, RYTHM_P0_ALERT_EMAIL_ENABLED: "false" }, fetcher: ok })).state, "disabled");
assert.equal((await deliverPilotP0Alert(event, { env: { ...env, VERCEL_GIT_COMMIT_REF: "main" }, fetcher: ok })).state, "disabled");
assert.equal((await deliverPilotP0Alert(event, { env: { ...env, RESEND_API_KEY: "" }, fetcher: ok })).state, "unconfigured");
assert.equal((await deliverPilotP0Alert(event, { env: { ...env, RYTHM_P0_SYNTHETIC_TEST_EMAIL_ENABLED: "false" }, fetcher: ok })).state, "suppressed");
assert.equal((await deliverPilotP0Alert({ ...event, severity: "P1" }, { env, fetcher: ok })).state, "suppressed");
assert.equal((await deliverPilotP0Alert({ ...event, environment: "production" }, { env: { ...env, VERCEL_ENV: "production", VERCEL_GIT_COMMIT_REF: "main" }, fetcher: ok })).state, "disabled", "explicit production approval required");
assert.equal(posts.length, before, "disabled and invalid states must not touch provider");
let attempts = 0;
const retryKeys: string[] = [];
const flaky = async (_url: string, init: RequestInit) => {
  attempts++;
  retryKeys.push((init.headers as Record<string,string>)["Idempotency-Key"]);
  return attempts <= 2 ? Response.json({}, { status: 503 }) : Response.json({ id: "ok" });
};
const retried = await deliverPilotP0Alert(event, { env, fetcher: flaky, sink: line => logs.push(line) });
assert.equal(attempts, 4, "each role gets one retry on transient failure");
assert.equal(retried.state, "accepted");
assert.equal(retryKeys[0], retryKeys[2], "primary retry key unchanged");
assert.equal(retryKeys[1], retryKeys[3], "backup retry key unchanged");
const partial = await deliverPilotP0Alert(event, { env, fetcher: async (_url, init) => {
  const data = JSON.parse(String(init.body)) as {to:string[]};
  return data.to[0].startsWith("primary")
    ? Response.json({ id: "ok" })
    : Response.json({ error: "PRIVATE_PROVIDER_RESPONSE" }, { status: 400 });
}, sink: line => logs.push(line) });
assert.deepEqual(partial, { state: "partial", primary: "accepted", backup: "failed" });
assert.ok(!logs.join("\n").includes("PRIVATE_PROVIDER_RESPONSE"));
const again = await deliverPilotP0Alert(event, { env, fetcher: ok, now: 0, sink: () => {} });
assert.equal(again.state, "accepted");
assert.deepEqual(posts.slice(0,2).map(x=>x.headers["Idempotency-Key"]).sort(),
  posts.slice(-2).map(x=>x.headers["Idempotency-Key"]).sort());
console.log("W15 P0 MAILER OFFLINE PASS: gates, dual contacts, retries, provider receipt, 15-minute idempotency and redacted telemetry");
console.log("W15 NOTICE: all Resend responses in this test are mocked; inbox delivery or acknowledgement is not established.");

}
void main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
