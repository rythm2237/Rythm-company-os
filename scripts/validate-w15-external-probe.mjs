import assert from "node:assert/strict";
import { TARGETS, probeAll, probeTarget } from "./w15-external-probe.mjs";

const fakeTime = (() => { let v = 0; return () => ++v; })();
const silentPause = async () => {};
const mock = (status, body) => async () => Response.json(body, { status });
const ok = async url => {
  if (url.endsWith("/api/status")) return Response.json({ status: "operational" });
  if (url.endsWith("/api/health")) return Response.json({ status: "ok" });
  return new Response("<html>RYTHM</html>", { status: 200 });
};
const good = await probeAll({ fetcher: ok, now: fakeTime, pause: silentPause });
assert.equal(good.overall, "pass");
assert.deepEqual(good.results.map(r => r.name), ["homepage", "public_status", "runtime_health"]);
assert.ok(good.results.every(r => r.httpStatus === 200 && r.outcome === "pass"));
const badConfig = await probeTarget(TARGETS[2], { fetcher: mock(200, { status: "error" }), now: fakeTime, pause: silentPause });
assert.equal(badConfig.outcome, "unexpected_health_status");
assert.equal(badConfig.attempts, 2);
const badHttp = await probeTarget(TARGETS[1], { fetcher: mock(503, { status: "attention_required" }), now: fakeTime, pause: silentPause });
assert.equal(badHttp.outcome, "http_status");
assert.equal(badHttp.httpStatus, 503);
let retryCount = 0;
const retry = await probeTarget(TARGETS[1], {
  fetcher: async () => ++retryCount === 1 ? Response.json({}, { status: 502 }) : Response.json({ status: "operational" }),
  now: fakeTime, pause: silentPause,
});
assert.equal(retry.outcome, "pass");
assert.equal(retry.attempts, 2);
const secretMessage = "Bearer never-leak-private-token-123456789";
const failNetwork = await probeTarget(TARGETS[0], {
  fetcher: async () => { throw new Error(secretMessage); }, now: fakeTime, pause: silentPause,
});
assert.equal(failNetwork.outcome, "network_error");
assert.ok(!JSON.stringify(failNetwork).includes(secretMessage));
const redirect = await probeTarget(TARGETS[0], {
  fetcher: async () => new Response(null, { status: 302 }), now: fakeTime, pause: silentPause,
});
assert.equal(redirect.outcome, "unexpected_redirect");
const invalidJson = await probeTarget(TARGETS[1], {
  fetcher: async () => new Response("not-json", { status: 200 }), now: fakeTime, pause: silentPause,
});
assert.equal(invalidJson.outcome, "invalid_json");
await assert.rejects(() => probeTarget(TARGETS[0], { origin: "http://127.0.0.1", fetcher: ok }), /invalid_origin/);
console.log("W15 EXTERNAL PROBE UNIT PASS: normal status, two-attempt fallback, 503, redirect, malformed response, network error, origin pinning and redaction");
