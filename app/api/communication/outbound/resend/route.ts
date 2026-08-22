import { NextResponse } from "next/server";
import { requireOwnerOrganizationContext } from "@/lib/auth/organization-context";

export const dynamic = "force-dynamic";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function jsonError(error: string, status: number) {
  return NextResponse.json(
    { ok: false, error },
    { status, headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}

export async function GET() {
  const { supabase, organizationId } = await requireOwnerOrganizationContext();
  const configured = Boolean(process.env.RESEND_API_KEY?.trim());

  const { data: queue, error } = await supabase
    .from("communication_messages")
    .select("id,thread_id,subject,sender_email,recipients,created_at,approved_at")
    .eq("organization_id", organizationId)
    .eq("status", "ready_for_delivery")
    .not("approved_at", "is", null)
    .order("approved_at", { ascending: true })
    .limit(25);

  if (error) return jsonError("Outbound queue could not be loaded.", 500);

  return NextResponse.json(
    { ok: true, configured, queue: queue ?? [] },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}

export async function POST(request: Request) {
  const resendApiKey = process.env.RESEND_API_KEY?.trim();
  if (!resendApiKey) return jsonError("Outbound email transport is not configured.", 503);

  const { supabase, user, organizationId } = await requireOwnerOrganizationContext();

  let payload: { messageId?: string };
  try {
    payload = (await request.json()) as { messageId?: string };
  } catch {
    return jsonError("Invalid request body.", 400);
  }

  const messageId = String(payload.messageId ?? "").trim();
  if (!messageId) return jsonError("messageId is required.", 400);

  const { data: message, error: messageError } = await supabase
    .from("communication_messages")
    .select("id,thread_id,mailbox_id,status,direction,sender_email,recipients,subject,body_text,approved_by_user_id,approved_at")
    .eq("organization_id", organizationId)
    .eq("id", messageId)
    .maybeSingle();

  if (messageError) return jsonError("Message could not be loaded.", 500);
  if (!message) return jsonError("Message not found.", 404);
  if (message.status !== "ready_for_delivery" || !message.approved_by_user_id || !message.approved_at) {
    return jsonError("Human-approved ready-for-delivery status is required.", 409);
  }

  const recipients = Array.isArray(message.recipients)
    ? message.recipients.filter((value): value is string => typeof value === "string" && emailPattern.test(value))
    : [];
  if (!recipients.length) return jsonError("No valid recipient is available.", 400);

  const { data: mailbox } = await supabase
    .from("communication_mailboxes")
    .select("id,address,is_active,approval_mode")
    .eq("organization_id", organizationId)
    .eq("id", message.mailbox_id)
    .maybeSingle();

  if (!mailbox?.is_active || mailbox.address !== message.sender_email) {
    return jsonError("Mailbox is not available for delivery.", 409);
  }
  if (mailbox.approval_mode === "draft_only") {
    return jsonError("This mailbox is configured for draft-only outbound communication.", 409);
  }

  const { data: priorInbound } = await supabase
    .from("communication_messages")
    .select("provider_message_id")
    .eq("organization_id", organizationId)
    .eq("thread_id", message.thread_id)
    .eq("direction", "inbound")
    .not("provider_message_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const headers: Record<string, string> = {};
  if (priorInbound?.provider_message_id) {
    headers["In-Reply-To"] = priorInbound.provider_message_id;
    headers["References"] = priorInbound.provider_message_id;
  }

  const resendResponse = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": `rythm-${organizationId}-${message.id}`,
    },
    body: JSON.stringify({
      from: `RYTHM <${mailbox.address}>`,
      to: recipients,
      subject: message.subject || "(no subject)",
      text: message.body_text || "",
      ...(Object.keys(headers).length ? { headers } : {}),
    }),
    cache: "no-store",
  });

  const resendBody = (await resendResponse.json().catch(() => null)) as { id?: string; message?: string } | null;
  if (!resendResponse.ok || !resendBody?.id) {
    await supabase.from("audit_events").insert({
      organization_id: organizationId,
      actor_type: "user",
      actor_user_id: user.id,
      event_type: "communication.outbound_delivery_failed",
      object_type: "communication_message",
      object_id: message.id,
      risk_level: "medium",
      payload: { thread_id: message.thread_id, provider: "resend", status: resendResponse.status },
    });
    return jsonError("Resend rejected the delivery request.", 502);
  }

  const now = new Date().toISOString();
  const { error: updateError } = await supabase
    .from("communication_messages")
    .update({
      direction: "outbound",
      status: "sent",
      provider_message_id: resendBody.id,
      sent_by_user_id: user.id,
      sent_at: now,
      updated_at: now,
      transport_source: "resend",
    })
    .eq("organization_id", organizationId)
    .eq("id", message.id)
    .eq("status", "ready_for_delivery");

  if (updateError) return jsonError("Provider accepted the email but RYTHM could not finalize delivery state.", 500);

  await supabase
    .from("communication_threads")
    .update({ status: "waiting_external", last_message_at: now, updated_at: now })
    .eq("organization_id", organizationId)
    .eq("id", message.thread_id);

  await supabase
    .from("communication_provider_connections")
    .update({ outbound_enabled: true, status: "connected", updated_at: now })
    .eq("organization_id", organizationId)
    .eq("provider_code", "rythm_managed");

  await supabase.from("audit_events").insert({
    organization_id: organizationId,
    actor_type: "user",
    actor_user_id: user.id,
    event_type: "communication.outbound_delivered",
    object_type: "communication_message",
    object_id: message.id,
    risk_level: "medium",
    payload: { thread_id: message.thread_id, provider: "resend", provider_message_id: resendBody.id },
  });

  return NextResponse.json({ ok: true, messageId: message.id, providerMessageId: resendBody.id });
}
