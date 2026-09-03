export type PublicExperienceEventName =
  | "tour_prompt_seen"
  | "tour_started"
  | "tour_language_selected"
  | "tour_step_viewed"
  | "tour_skipped"
  | "tour_completed"
  | "explain_mode_enabled"
  | "explain_mode_disabled"
  | "explanation_viewed"
  | "experience_mode_discovered"
  | "experience_mode_entered"
  | "experience_mode_exited"
  | "demo_get_started_clicked"
  | "demo_sign_in_clicked"
  | "solution_finder_started"
  | "solution_finder_dismissed"
  | "solution_finder_answered"
  | "solution_finder_recommended"
  | "solution_finder_primary_clicked"
  | "solution_finder_meeting_clicked"
  | "ai_referral_detected"
  | "organic_referral_detected"
  | "demo_conversion"
  | "signup_conversion"
  | "enterprise_inquiry_conversion";

export type PublicExperienceEvent = {
  name: PublicExperienceEventName;
  properties?: Record<string, string | number | boolean | null>;
};

export type PublicAttribution = {
  kind: "ai" | "organic";
  source: string;
  landing_path: string;
  referrer_host: string;
};

export const PUBLIC_ATTRIBUTION_SESSION_KEY = "rythm:public-attribution";

export function readPublicAttribution(): PublicAttribution | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.sessionStorage.getItem(PUBLIC_ATTRIBUTION_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PublicAttribution>;
    if (
      (parsed.kind === "ai" || parsed.kind === "organic") &&
      typeof parsed.source === "string" &&
      typeof parsed.landing_path === "string" &&
      typeof parsed.referrer_host === "string"
    ) {
      return parsed as PublicAttribution;
    }
  } catch {
    // Invalid session attribution is ignored rather than blocking the public experience.
  }

  return null;
}

export function writePublicAttribution(attribution: PublicAttribution) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(PUBLIC_ATTRIBUTION_SESSION_KEY, JSON.stringify(attribution));
  } catch {
    // Analytics must never block the user journey.
  }
}

/**
 * Vendor-neutral public experience analytics boundary.
 *
 * Product components remain decoupled from any analytics vendor. Events are
 * dispatched locally and also sent to a first-party, content-minimized server
 * endpoint. The durable payload intentionally carries no identity, tenant,
 * email, raw referrer URL, user-agent, IP address, or free-text content.
 */
export function trackPublicExperienceEvent(event: PublicExperienceEvent) {
  if (typeof window === "undefined") return;

  window.dispatchEvent(new CustomEvent<PublicExperienceEvent>("rythm:public-experience", { detail: event }));

  const payload = JSON.stringify({
    name: event.name,
    path: window.location.pathname,
    attribution: readPublicAttribution(),
    properties: event.properties ?? {},
  });

  void fetch("/api/analytics/public-events", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: payload,
    keepalive: true,
    credentials: "same-origin",
  }).catch(() => {
    // Analytics failure is deliberately non-blocking.
  });

  if (process.env.NODE_ENV === "development") {
    console.info("[RYTHM public experience]", event.name, event.properties ?? {});
  }
}
