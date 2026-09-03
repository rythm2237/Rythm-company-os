import { NextResponse } from "next/server";
import { createAnalyticsAdminClient } from "@/lib/supabase/analytics-admin";

const EVENT_NAMES = new Set([
  "tour_prompt_seen",
  "tour_started",
  "tour_language_selected",
  "tour_step_viewed",
  "tour_skipped",
  "tour_completed",
  "explain_mode_enabled",
  "explain_mode_disabled",
  "explanation_viewed",
  "experience_mode_discovered",
  "experience_mode_entered",
  "experience_mode_exited",
  "demo_get_started_clicked",
  "demo_sign_in_clicked",
  "solution_finder_started",
  "solution_finder_dismissed",
  "solution_finder_answered",
  "solution_finder_recommended",
  "solution_finder_primary_clicked",
  "solution_finder_meeting_clicked",
  "ai_referral_detected",
  "organic_referral_detected",
  "demo_conversion",
  "signup_conversion",
  "enterprise_inquiry_conversion",
]);

const SAFE_PROPERTY_KEYS = new Set([
  "engine",
  "language",
  "step",
  "step_id",
  "product_code",
  "recommendation",
  "destination",
  "source",
]);

const CONVERSION_TYPE: Record<string, string> = {
  demo_conversion: "demo",
  signup_conversion: "signup",
  enterprise_inquiry_conversion: "enterprise_inquiry",
};

function safeToken(value: unknown, maxLength = 120) {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (!normalized || normalized.length > maxLength) return null;
  return /^[a-z0-9._:/-]+$/.test(normalized) ? normalized : null;
}

function safePath(value: unknown) {
  if (typeof value !== "string") return null;
  const path = value.trim();
  if (!path.startsWith("/") || path.length > 180 || /[\r\n]/.test(path)) return null;
  return path;
}

function safeProperties(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const result: Record<string, string | number | boolean | null> = {};

  for (const [key, raw] of Object.entries(value)) {
    if (!SAFE_PROPERTY_KEYS.has(key)) continue;
    if (raw === null || typeof raw === "boolean" || typeof raw === "number") {
      result[key] = raw;
      continue;
    }
    const token = safeToken(raw, 80);
    if (token) result[key] = token;
  }

  return result;
}

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (contentLength > 4096) {
    return NextResponse.json({ ok: false }, { status: 413 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const eventName = typeof body.name === "string" ? body.name : "";
  if (!EVENT_NAMES.has(eventName)) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const attribution =
    body.attribution && typeof body.attribution === "object" && !Array.isArray(body.attribution)
      ? (body.attribution as Record<string, unknown>)
      : null;
  const attributionKind = attribution?.kind === "ai" || attribution?.kind === "organic" ? attribution.kind : null;
  const attributionSource = safeToken(attribution?.source, 80);
  const referrerHost = safeToken(attribution?.referrer_host, 120);
  const landingPath = safePath(attribution?.landing_path);

  const supabase = createAnalyticsAdminClient();
  if (!supabase) {
    return NextResponse.json({ ok: false }, { status: 503 });
  }

  const { error } = await supabase.from("public_analytics_events").insert({
    event_name: eventName,
    path: safePath(body.path),
    attribution_kind: attributionKind,
    attribution_source: attributionSource,
    landing_path: landingPath,
    referrer_host: referrerHost,
    conversion_type: CONVERSION_TYPE[eventName] ?? null,
    properties: safeProperties(body.properties),
  });

  if (error) {
    console.error("public_analytics_event_insert_failed", {
      code: error.code ?? null,
      eventName,
    });
    return NextResponse.json({ ok: false }, { status: 503 });
  }

  return new NextResponse(null, { status: 204 });
}
