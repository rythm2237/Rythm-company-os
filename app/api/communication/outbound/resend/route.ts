import { NextResponse } from "next/server";
import { requireOwnerOrganizationContext } from "@/lib/auth/organization-context";
import { requestToolExecution } from "@/lib/integrations/execution-gateway";
import { createExecutionServiceClient } from "@/lib/integrations/service-runner";

export const dynamic = "force-dynamic";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function jsonError(error: string, status: number) {
  return NextResponse.json(
    { ok: false, error },
    { status, headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}

export async function GET(request: Request) {
  const configured = Boolean(process.env.RESEND_API_KEY?.trim());
  const url = new URL(request.url);

  if (url.searchParams.get("status") === "1") {
    return NextResponse.json(
      { ok: true, configured },
      { headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  }

  const { supabase, organizationId } = await requireOwnerOrganizationContext();
  const { data: queue, error } = await supabase
    .from("communication_messages")
    .select(
      "id,thread_id,subject,sender_email,recipients,created_at,approved_at",
    )
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
  if (!resendApiKey)
    return jsonError("Outbound email transport is not configured.", 503);

  const { supabase, user, organizationId } =
    await requireOwnerOrganizationContext();

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
    .select(
      "id,thread_id,mailbox_id,status,direction,sender_email,recipients,subject,body_text,approved_by_user_id,approved_at",
    )
    .eq("organization_id", organizationId)
    .eq("id", messageId)
    .maybeSingle();

  if (messageError) return jsonError("Message could not be loaded.", 500);
  if (!message) return jsonError("Message not found.", 404);
  if (
    message.status !== "ready_for_delivery" ||
    !message.approved_by_user_id ||
    !message.approved_at
  ) {
    return jsonError(
      "Human-approved ready-for-delivery status is required.",
      409,
    );
  }

  const recipients = Array.isArray(message.recipients)
    ? message.recipients.filter(
        (value): value is string =>
          typeof value === "string" && emailPattern.test(value),
      )
    : [];
  if (!recipients.length)
    return jsonError("No valid recipient is available.", 400);

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
    return jsonError(
      "This mailbox is configured for draft-only outbound communication.",
      409,
    );
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

  const service = createExecutionServiceClient();
  const { data: integration, error: integrationError } = await service
    .from("organization_integrations")
    .upsert(
      {
        organization_id: organizationId,
        provider_key: "resend",
        display_name: "RYTHM Managed Resend",
        account_ref: "rythm-managed",
        auth_type: "token",
        status: "connected",
        enabled: true,
        granted_scopes: ["email.send"],
        metadata: { credential_source: "platform_env" },
        connected_by_user_id: user.id,
        connected_at: new Date().toISOString(),
        last_verified_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "organization_id,provider_key,display_name" },
    )
    .select("id")
    .single();
  if (integrationError || !integration)
    return jsonError("Governed Resend connection could not be prepared.", 500);
  const exactPayload = {
    messageId: message.id,
    threadId: message.thread_id,
    from: `RYTHM <${mailbox.address}>`,
    to: recipients,
    subject: message.subject || "(no subject)",
    text: message.body_text || "",
    ...(Object.keys(headers).length ? { headers } : {}),
  };
  const execution = await requestToolExecution(service, {
    organizationId,
    userId: user.id,
    integrationId: integration.id,
    toolId: "resend.email",
    capabilityKey: "email.send",
    targetRef: recipients.join(", "),
    input: exactPayload,
    persistedInput: {
      messageId: exactPayload.messageId,
      threadId: exactPayload.threadId,
      from: exactPayload.from,
      to: exactPayload.to,
      subject: exactPayload.subject,
      ...(exactPayload.headers ? { headers: exactPayload.headers } : {}),
    },
    payloadSummary: {
      subject: exactPayload.subject,
      recipientCount: recipients.length,
    },
    payloadReference: `communication_message:${message.id}`,
    idempotencyKey: `resend:${organizationId}:${message.id}:${message.approved_at}`,
    requestedBy: "user",
    authoritySource: "human",
    intent: "send_approved_company_email",
  });
  return NextResponse.json(
    {
      ok: true,
      messageId: message.id,
      executionId: execution.id,
      approvalId: execution.approval_request_id ?? null,
      status: execution.status,
      message:
        execution.status === "waiting_approval"
          ? "Execution Gateway approval is required before delivery."
          : execution.status === "simulated"
            ? "Delivery was simulated; no email was sent."
            : "Delivery proposal recorded.",
    },
    { status: execution.status === "waiting_approval" ? 202 : 200 },
  );
}
