import assert from "node:assert/strict";
import { createHmac } from "node:crypto";

// One-shot production-build-only handshake. No customer identifiers, database
// reads or writes, notification delivery, model/provider calls, or secret logs.
if (process.env.VERCEL_ENV !== "production" || process.env.W06_PROBE_ONCE !== "true") {
  console.log("SKIP W06 production signed Edge handshake (not enabled for this build)");
} else {
  const projectUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/+$/, "");
  assert.equal(projectUrl, "https://dezbacyuvsdrlpmmpjht.supabase.co",
    "W06 handshake must only target allowlisted production Supabase");
  const configured = process.env.TWO_NYA_PUSH_DISPATCH_SECRET;
  const serviceCredential = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  const secret = configured ?? (serviceCredential.length >= 32
    ? createHmac("sha256", serviceCredential)
        .update("RYTHM/W06/two-nya-push/dispatch/v1")
        .digest("hex")
    : "");
  assert.ok(secret.length >= 32, "W06 secure signing cannot run: missing server-only secret");
  const body = JSON.stringify({ event_type: "__w06_noop__", target: "none" });
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = createHmac("sha256", secret).update(timestamp + "." + body).digest("hex");
  let response;
  try {
    response = await fetch(projectUrl + "/functions/v1/two-nya-push", {
      method: "POST",
      redirect: "error",
      cache: "no-store",
      headers: {
        "content-type": "application/json",
        "x-rythm-push-timestamp": timestamp,
        "x-rythm-push-signature": signature,
      },
      body,
      signal: AbortSignal.timeout(12000),
    });
  } catch {
    throw Error("W06 production signed Edge handshake transport failed");
  }
  const result = await response.json().catch(() => ({}));
  // This response is obtainable ONLY after valid HMAC and BEFORE construction
  // of the service-role client; an unsigned/incorrect key receives 401.
  assert.equal(response.status, 400, "W06 HMAC handshake was not authorized");
  assert.equal(result.error, "invalid_request", "W06 Edge pre-DB no-op result mismatch");
  console.log("PASS W06 production signed Edge HMAC accepted: pre-DB invalid-event 400, no customer/provider operations");
}
