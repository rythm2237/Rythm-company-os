export type PublicExperienceEventName =
  | "tour_prompt_seen"
  | "tour_started"
  | "tour_skipped"
  | "tour_completed"
  | "tour_language_changed"
  | "explain_mode_started"
  | "explain_mode_closed"
  | "explanation_opened"
  | "experience_mode_started"
  | "experience_mode_closed"
  | "demo_get_started_clicked"
  | "demo_sign_in_clicked";

export type PublicExperienceEvent = {
  name: PublicExperienceEventName;
  properties?: Record<string, string | number | boolean | null>;
};

/**
 * Vendor-neutral public experience analytics boundary.
 *
 * The CustomEvent keeps product components decoupled from a future analytics
 * provider. It intentionally carries no identity, tenant, or free-text data.
 */
export function trackPublicExperienceEvent(event: PublicExperienceEvent) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<PublicExperienceEvent>("rythm:public-experience", { detail: event }));

  if (process.env.NODE_ENV === "development") {
    console.info("[RYTHM public experience]", event.name, event.properties ?? {});
  }
}
