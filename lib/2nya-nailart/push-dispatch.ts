import { createHmac } from "node:crypto";

// The capability is purpose-derived; the Supabase service-role credential itself
// is never sent to the public Edge endpoint. The Edge validates HMAC before DB access.
export type NailPushDispatch =
  | {
      appointment_id: string;
      event_type: "booking_requested" | "request_approved" | "request_rejected";
      target: "admin" | "customer";
    }
  | {
      message_id: string;
      event_type: "contact_message";
      target: "admin";
    };

export async function dispatchNailPush(payload: NailPushDispatch): Promise<boolean> {
  if (typeof window !== "undefined") throw new Error("Push dispatch is server-only.");
  const configuredSecret = process.env.TWO_NYA_PUSH_DISPATCH_SECRET;
  const serviceCredential = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  const secret = configuredSecret ?? (serviceCredential.length >= 32
    ? createHmac("sha256", serviceCredential)
        .update("RYTHM/W06/two-nya-push/dispatch/v1")
        .digest("hex")
    : "");
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/+$/, "") || "";

  if (secret.length < 32 || !/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(supabaseUrl)) {
    console.error("nail_push_dispatch_not_configured");
    return false;
  }

  const body = JSON.stringify(payload);
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = createHmac("sha256", secret)
    .update(timestamp + "." + body)
    .digest("hex");

  try {
    const response = await fetch(supabaseUrl + "/functions/v1/two-nya-push", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-rythm-push-timestamp": timestamp,
        "x-rythm-push-signature": signature,
      },
      body,
      cache: "no-store",
      signal: AbortSignal.timeout(6000),
    });
    if (!response.ok) console.error("nail_push_dispatch_rejected", response.status);
    return response.ok;
  } catch {
    console.error("nail_push_dispatch_transport_failed");
    return false;
  }
}
