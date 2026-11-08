import "server-only";
import { createHmac } from "node:crypto";

// This server-to-Edge capability is neither a customer JWT nor a service-role key.
// The Edge handler checks the signature before all privileged database access.
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
  const secret = process.env.TWO_NYA_PUSH_DISPATCH_SECRET || "";
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
