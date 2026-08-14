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
  | "solution_finder_meeting_clicked";

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
