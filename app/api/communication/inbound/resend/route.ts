import { createHmac, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_WEBHOOK_AGE_SECONDS = 5 * 60;

type ResendReceivedEvent = {
  type: "email.received";
  created_at?: string;
  data: {
    email_id: string;
    message_id?: string;
    created_at?: string;
    from?: string;
    to?: string[];
    cc?: string[];
    bcc?: string[];
    subject?: string;
    attachments?: unknown[];
  };
};

function decodeWebhookSecret(secret: string) {
  const encoded = secret.startsWith("whsec_") ? secret.slice(6) : secret;
  return Buffer.from(encoded, "base64");
}

function verifySvixSignature(rawBody: string, request: NextRequest, secret: string) {
  const messageId = request.headers.get("svix-id");
  const timestamp = request.headers.get("svix-timestamp");
  const signatureHeader = request.headers.get("svix-signature");

  if (!messageId || !timestamp || !signatureHeader) return false;

  const timestampNumber = Number(timestamp);
  if (!Number.isFinite(timestampNumber)) return false;
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSeconds - timestampNumber) > MAX_WEBHOOK_AGE_SECONDS) return false;

  const signedPayload = `${messageId}.${timestamp}.${rawBody}`;
  const expected = createHmac("sha256", decodeWebhookSecret(secret))
    .update(signedPayload)
    .digest();

  return signatureHeader
    .split(" ")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .some((entry) => {
      const [version, encodedSignature] = entry.split(",", 2);
      if (version !== "v1" || !encodedSignature) return false;
      try {
        const candidate = Buffer.from(encodedSignature, "base64");
        return candidate.length === expected.length && timingSafeEqual(candidate, expected);
      } catch {
        return false;
      }
    });
}

function normalizeAddress(value: string) {
  const angleMatch = value.match(/<([^>]+)>/);
  return (angleMatch?.[1] ?? value).trim().toLowerCase();
}

function parseSender(value?: string) {
  if (!value) return { name: null as string | null, email: null as string | null };
  const angleMatch = value.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
  if (angleMatch) {
    const rawName = angleMatch[1].trim().replace(/^"|"$/g, "");
    return { name: rawName || null, email: angleMatch[2].trim().toLowerCase() };
  }
  return { name: null, email: normalizeAddress(value) };
}

function normalizeSubject(subject?: string) {
  return (subject || "(no subject)")
    .replace(/^\s*((re|fw|fwd)\s*:\s*)+/i, "")
    .trim()
    .toLowerCase()
    .slice(0, 300);
}

export async function POST(request: NextRequest) {
  const webhookSecret = process.env.RESEND_WEBHOOK_SECRET;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!webhookSecret || !supabaseUrl || !serviceRoleKey) {
    console.error("Resend inbound endpoint is not configured with required server secrets.");
    return NextResponse.json({ error: "transport_not_configured" }, { status: 503 });
  }

  const rawBody = await request.text();
  if (!verifySvixSignature(rawBody, request, webhookSecret)) {
    return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
  }

  let event: ResendReceivedEvent;
  try {
    event = JSON.parse(rawBody) as ResendReceivedEvent;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  if (event.type !== "email.received" || !event.data?.email_id) {
    return NextResponse.json({ received: true, ignored: true });
  }

  const recipients = Array.isArray(event.data.to)
    ? event.data.to.map(normalizeAddress).filter(Boolean)
    : [];

  if (!recipients.length) {
    return NextResponse.json({ received: true, ignored: true, reason: "no_recipient" });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: mailboxes, error: mailboxError } = await supabase
    .from("communication_mailboxes")
    .select("id,organization_id,address,assigned_agent_id,is_active")
    .in("address", recipients)
    .eq("is_active", true);

  if (mailboxError) {
    console.error("Inbound mailbox resolution failed", mailboxError);
    return NextResponse.json({ error: "mailbox_resolution_failed" }, { status: 500 });
  }

  if (!mailboxes?.length) {
    // Unknown aliases on the catch-all transport domain are intentionally acknowledged
    // so Resend does not retry them indefinitely.
    return NextResponse.json({ received: true, ignored: true, reason: "unknown_mailbox" });
  }

  const sender = parseSender(event.data.from);
  const subject = (event.data.subject || "(no subject)").slice(0, 300);
  const normalizedSubject = normalizeSubject(event.data.subject);
  const createdAt = event.data.created_at || event.created_at || new Date().toISOString();
  let processed = 0;

  for (const mailbox of mailboxes) {
    const { data: existing } = await supabase
      .from("communication_messages")
      .select("id")
      .eq("organization_id", mailbox.organization_id)
      .eq("mailbox_id", mailbox.id)
      .eq("provider_message_id", event.data.email_id)
      .maybeSingle();

    if (existing) continue;

    const { data: thread, error: threadError } = await supabase
      .from("communication_threads")
      .insert({
        organization_id: mailbox.organization_id,
        mailbox_id: mailbox.id,
        subject,
        normalized_subject: normalizedSubject,
        status: "open",
        priority: "normal",
        category: "Inbound",
        sender_name: sender.name,
        sender_email: sender.email,
        assigned_agent_id: mailbox.assigned_agent_id,
        requires_manager_attention: false,
        last_message_at: createdAt,
        created_at: createdAt,
        updated_at: createdAt,
      })
      .select("id")
      .single();

    if (threadError || !thread) {
      console.error("Inbound thread creation failed", threadError);
      return NextResponse.json({ error: "thread_creation_failed" }, { status: 500 });
    }

    const { error: messageError } = await supabase
      .from("communication_messages")
      .insert({
        organization_id: mailbox.organization_id,
        thread_id: thread.id,
        mailbox_id: mailbox.id,
        direction: "inbound",
        status: "received",
        provider_message_id: event.data.email_id,
        sender_name: sender.name,
        sender_email: sender.email,
        recipients,
        cc_recipients: Array.isArray(event.data.cc)
          ? event.data.cc.map(normalizeAddress).filter(Boolean)
          : [],
        subject,
        body_text: null,
        body_html: null,
        created_at: createdAt,
        updated_at: createdAt,
      });

    if (messageError) {
      await supabase
        .from("communication_threads")
        .delete()
        .eq("organization_id", mailbox.organization_id)
        .eq("id", thread.id);
      console.error("Inbound message creation failed", messageError);
      return NextResponse.json({ error: "message_creation_failed" }, { status: 500 });
    }

    await supabase.from("audit_events").insert({
      organization_id: mailbox.organization_id,
      actor_type: "system",
      event_type: "communication.resend_email_received",
      object_type: "communication_thread",
      object_id: thread.id,
      risk_level: "low",
      payload: {
        provider: "resend",
        provider_email_id: event.data.email_id,
        message_id: event.data.message_id ?? null,
        mailbox: mailbox.address,
        sender: sender.email,
        attachments_count: Array.isArray(event.data.attachments) ? event.data.attachments.length : 0,
        body_fetch_state: "pending_resend_api_key",
      },
    });

    processed += 1;
  }

  return NextResponse.json({ received: true, processed });
}
