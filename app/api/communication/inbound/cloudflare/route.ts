import { createHash, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_RAW_BYTES = 3 * 1024 * 1024;

type CloudflareInboundPayload = {
  from?: string;
  to?: string;
  subject?: string;
  messageId?: string;
  rawBase64?: string;
  rawSize?: number;
};

function safeEqualText(a: string, b: string) {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  return aBuf.length === bBuf.length && timingSafeEqual(aBuf, bBuf);
}

function normalizeAddress(value?: string) {
  if (!value) return "";
  const angleMatch = value.match(/<([^>]+)>/);
  return (angleMatch?.[1] ?? value).trim().toLowerCase();
}

function normalizeSubject(subject?: string) {
  return (subject || "(no subject)")
    .replace(/^\s*((re|fw|fwd)\s*:\s*)+/i, "")
    .trim()
    .toLowerCase()
    .slice(0, 300);
}

function decodeQuotedPrintable(input: string) {
  const softBreaksRemoved = input.replace(/=\r?\n/g, "");
  const bytes: number[] = [];
  for (let i = 0; i < softBreaksRemoved.length; i += 1) {
    if (softBreaksRemoved[i] === "=" && /^[0-9A-Fa-f]{2}$/.test(softBreaksRemoved.slice(i + 1, i + 3))) {
      bytes.push(Number.parseInt(softBreaksRemoved.slice(i + 1, i + 3), 16));
      i += 2;
    } else {
      bytes.push(softBreaksRemoved.charCodeAt(i));
    }
  }
  return Buffer.from(bytes).toString("utf8");
}

function decodeBody(body: string, transferEncoding: string) {
  const encoding = transferEncoding.toLowerCase();
  if (encoding.includes("base64")) {
    try {
      return Buffer.from(body.replace(/\s+/g, ""), "base64").toString("utf8");
    } catch {
      return body;
    }
  }
  if (encoding.includes("quoted-printable")) return decodeQuotedPrintable(body);
  return body;
}

function extractTextPreview(raw: string) {
  const [headerBlock = "", ...bodyParts] = raw.split(/\r?\n\r?\n/);
  const body = bodyParts.join("\r\n\r\n");
  const contentType = headerBlock.match(/^content-type:\s*([^\r\n]+)/im)?.[1] ?? "text/plain";
  const transferEncoding = headerBlock.match(/^content-transfer-encoding:\s*([^\r\n]+)/im)?.[1] ?? "";

  if (!/multipart\//i.test(contentType)) {
    return decodeBody(body, transferEncoding).trim().slice(0, 20000);
  }

  const boundary = contentType.match(/boundary\s*=\s*(?:"([^"]+)"|([^;\s]+))/i)?.[1]
    ?? contentType.match(/boundary\s*=\s*(?:"([^"]+)"|([^;\s]+))/i)?.[2];
  if (!boundary) return "";

  const parts = body.split(`--${boundary}`);
  for (const part of parts) {
    const [partHeaders = "", ...partBodyParts] = part.split(/\r?\n\r?\n/);
    if (!/content-type:\s*text\/plain/i.test(partHeaders)) continue;
    const partEncoding = partHeaders.match(/^content-transfer-encoding:\s*([^\r\n]+)/im)?.[1] ?? "";
    const partBody = partBodyParts.join("\r\n\r\n").replace(/\r?\n--\s*$/, "");
    return decodeBody(partBody, partEncoding).trim().slice(0, 20000);
  }

  return "";
}

export async function POST(request: NextRequest) {
  const expectedSecret = process.env.CLOUDFLARE_EMAIL_WORKER_SECRET
    ?? process.env.CLOUDFLARE_EMAIL_INGEST_SECRET;
  const suppliedSecret = request.headers.get("x-rythm-email-secret") ?? "";
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!expectedSecret || !supabaseUrl || !serviceRoleKey) {
    console.error("Cloudflare inbound endpoint is missing required server configuration.");
    return NextResponse.json({ error: "transport_not_configured" }, { status: 503 });
  }

  if (!suppliedSecret || !safeEqualText(suppliedSecret, expectedSecret)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let payload: CloudflareInboundPayload;
  try {
    payload = (await request.json()) as CloudflareInboundPayload;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const recipient = normalizeAddress(payload.to);
  const sender = normalizeAddress(payload.from);
  const rawBase64 = payload.rawBase64 ?? "";
  if (!recipient || !sender || !rawBase64) {
    return NextResponse.json({ error: "missing_required_fields" }, { status: 400 });
  }

  let rawBuffer: Buffer;
  try {
    rawBuffer = Buffer.from(rawBase64, "base64");
  } catch {
    return NextResponse.json({ error: "invalid_raw_message" }, { status: 400 });
  }

  if (!rawBuffer.length || rawBuffer.length > MAX_RAW_BYTES || (payload.rawSize && payload.rawSize > MAX_RAW_BYTES)) {
    return NextResponse.json({ error: "message_too_large" }, { status: 413 });
  }

  const rawMime = rawBuffer.toString("utf8");
  const providerMessageId = `cloudflare:${payload.messageId?.trim() || createHash("sha256").update(rawBuffer).digest("hex")}`;
  const subject = (payload.subject || "(no subject)").slice(0, 300);
  const createdAt = new Date().toISOString();

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: mailbox, error: mailboxError } = await supabase
    .from("communication_mailboxes")
    .select("id,organization_id,address,assigned_agent_id,is_active")
    .eq("address", recipient)
    .eq("is_active", true)
    .maybeSingle();

  if (mailboxError) {
    console.error("Cloudflare inbound mailbox resolution failed", mailboxError);
    return NextResponse.json({ error: "mailbox_resolution_failed" }, { status: 500 });
  }

  if (!mailbox) {
    return NextResponse.json({ error: "unknown_mailbox" }, { status: 404 });
  }

  const { data: existing } = await supabase
    .from("communication_messages")
    .select("id")
    .eq("organization_id", mailbox.organization_id)
    .eq("mailbox_id", mailbox.id)
    .eq("provider_message_id", providerMessageId)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  const { data: thread, error: threadError } = await supabase
    .from("communication_threads")
    .insert({
      organization_id: mailbox.organization_id,
      mailbox_id: mailbox.id,
      subject,
      normalized_subject: normalizeSubject(subject),
      status: "open",
      priority: "normal",
      category: "Inbound",
      sender_name: null,
      sender_email: sender,
      assigned_agent_id: mailbox.assigned_agent_id,
      requires_manager_attention: false,
      last_message_at: createdAt,
      created_at: createdAt,
      updated_at: createdAt,
    })
    .select("id")
    .single();

  if (threadError || !thread) {
    console.error("Cloudflare inbound thread creation failed", threadError);
    return NextResponse.json({ error: "thread_creation_failed" }, { status: 500 });
  }

  const bodyText = extractTextPreview(rawMime);
  const { error: messageError } = await supabase
    .from("communication_messages")
    .insert({
      organization_id: mailbox.organization_id,
      thread_id: thread.id,
      mailbox_id: mailbox.id,
      direction: "inbound",
      status: "received",
      provider_message_id: providerMessageId,
      sender_name: null,
      sender_email: sender,
      recipients: [recipient],
      cc_recipients: [],
      subject,
      body_text: bodyText || "(Message received; MIME parsing pending.)",
      body_html: null,
      raw_mime: rawMime,
      transport_source: "cloudflare_email_worker",
      created_at: createdAt,
      updated_at: createdAt,
    });

  if (messageError) {
    await supabase
      .from("communication_threads")
      .delete()
      .eq("organization_id", mailbox.organization_id)
      .eq("id", thread.id);
    console.error("Cloudflare inbound message creation failed", messageError);
    return NextResponse.json({ error: "message_creation_failed" }, { status: 500 });
  }

  await supabase.from("audit_events").insert({
    organization_id: mailbox.organization_id,
    actor_type: "system",
    event_type: "communication.cloudflare_email_received",
    object_type: "communication_thread",
    object_id: thread.id,
    risk_level: "low",
    payload: {
      transport: "cloudflare_email_worker",
      provider_message_id: providerMessageId,
      mailbox: mailbox.address,
      sender,
      raw_size: rawBuffer.length,
    },
  });

  return NextResponse.json({ received: true, threadId: thread.id });
}
