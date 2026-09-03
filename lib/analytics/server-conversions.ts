import "server-only";

import { cookies } from "next/headers";
import { PUBLIC_ATTRIBUTION_COOKIE, type PublicAttribution } from "@/lib/analytics/public-events";
import { createAnalyticsAdminClient } from "@/lib/supabase/analytics-admin";

type ConfirmedConversionName =
  | "confirmed_signup_conversion"
  | "qualified_enterprise_lead_conversion";

const CONVERSION_TYPE: Record<ConfirmedConversionName, string> = {
  confirmed_signup_conversion: "confirmed_signup",
  qualified_enterprise_lead_conversion: "qualified_enterprise_lead",
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

function parseAttribution(raw: string | undefined): PublicAttribution | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(decodeURIComponent(raw)) as Partial<PublicAttribution>;
    const kind = parsed.kind === "ai" || parsed.kind === "organic" ? parsed.kind : null;
    const source = safeToken(parsed.source, 80);
    const landingPath = safePath(parsed.landing_path);
    const referrerHost = safeToken(parsed.referrer_host, 120);
    if (!kind || !source || !landingPath || !referrerHost) return null;
    return { kind, source, landing_path: landingPath, referrer_host: referrerHost };
  } catch {
    return null;
  }
}

export async function readServerPublicAttribution() {
  const cookieStore = await cookies();
  return parseAttribution(cookieStore.get(PUBLIC_ATTRIBUTION_COOKIE)?.value);
}

export async function recordConfirmedPublicConversion(
  eventName: ConfirmedConversionName,
  path: string,
  properties: Record<string, string | number | boolean | null> = {},
) {
  const attribution = await readServerPublicAttribution();
  if (!attribution) return { recorded: false as const, reason: "no_attribution" as const };

  const supabase = createAnalyticsAdminClient();
  if (!supabase) return { recorded: false as const, reason: "analytics_unavailable" as const };

  const safeProperties = Object.fromEntries(
    Object.entries(properties).filter(([, value]) =>
      value === null || typeof value === "boolean" || typeof value === "number" ||
      (typeof value === "string" && /^[a-z0-9._:/-]{1,80}$/i.test(value)),
    ),
  );

  const { error } = await supabase.from("public_analytics_events").insert({
    event_name: eventName,
    path: safePath(path),
    attribution_kind: attribution.kind,
    attribution_source: attribution.source,
    landing_path: attribution.landing_path,
    referrer_host: attribution.referrer_host,
    conversion_type: CONVERSION_TYPE[eventName],
    properties: safeProperties,
  });

  if (error) {
    console.error("confirmed_public_conversion_insert_failed", {
      code: error.code ?? null,
      eventName,
    });
    return { recorded: false as const, reason: "insert_failed" as const };
  }

  return { recorded: true as const };
}
