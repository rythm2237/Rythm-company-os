import type { PilotSignal } from "./pilot";

/** Fail-closed email delivery: provider acceptance is not recipient delivery or human acknowledgement. */
type Fetcher = (url: string, init: RequestInit) => Promise<Response>;
type Result = "accepted" | "failed" | "not_attempted";
export type PilotMailResult = Readonly<{
  state: "disabled" | "suppressed" | "unconfigured" | "accepted" | "partial" | "failed";
  primary: Result;
  backup: Result;
}>;
type Deps = {
  env?: NodeJS.ProcessEnv;
  fetcher?: Fetcher;
  now?: number;
  sink?: (line: string) => void;
};
const none = { primary: "not_attempted" as const, backup: "not_attempted" as const };
const emailPattern = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
const senderPattern = /^[a-z0-9._%+\-]+@(?:rythm-os\.com|mail\.rythm-os\.com|auth\.rythm-os\.com)$/i;

export async function deliverPilotP0Alert(signal: PilotSignal, deps: Deps = {}): Promise<PilotMailResult> {
  const env = deps.env ?? process.env;
  const fetcher = deps.fetcher ?? fetch;
  const windowId = Math.floor((deps.now ?? Date.now()) / 900000);
  const preview = signal.environment === "preview" && env.VERCEL_ENV === "preview" &&
    env.VERCEL_GIT_COMMIT_REF === "pilot/w15-incident-observability";
  const production = signal.environment === "production" && env.VERCEL_ENV === "production" &&
    env.RYTHM_P0_PRODUCTION_ALERTS_APPROVED === "true";
  if (env.RYTHM_P0_ALERT_EMAIL_ENABLED !== "true" || !(preview || production))
    return { state: "disabled", ...none };
  if (signal.severity !== "P0" || signal.outcome !== "failed" ||
      !/^[a-z_]{3,40}$/.test(signal.surface) || !/^[A-Z0-9_]{3,64}$/.test(signal.code))
    return { state: "suppressed", ...none };
  if (signal.code === "SYNTHETIC_OUTAGE" && (!preview || env.RYTHM_P0_SYNTHETIC_TEST_EMAIL_ENABLED !== "true"))
    return { state: "suppressed", ...none };
  const key = env.RESEND_API_KEY?.trim();
  const from = env.RYTHM_P0_ALERT_FROM?.trim() ?? "";
  const primary = env.RYTHM_P0_ALERT_PRIMARY_EMAIL?.trim() ?? "";
  const backup = env.RYTHM_P0_ALERT_BACKUP_EMAIL?.trim() ?? "";
  if (!key || !senderPattern.test(from) || !emailPattern.test(primary) ||
      !emailPattern.test(backup) || primary.toLowerCase() === backup.toLowerCase())
    return { state: "unconfigured", ...none };
  const start = new Date(windowId * 900000).toISOString();
  const subject = `[RYTHM W15 P0][${signal.environment}] ${signal.surface} / ${signal.code}`;
  const body = [
    "RYTHM W15 P0 incident alert", `Environment: ${signal.environment}`,
    `Surface: ${signal.surface}`, `Code: ${signal.code}`,
    `15-minute UTC window: ${start}`,
    "Check Vercel runtime logs and the W15 response runbook.",
    "Provider acceptance does not confirm human acknowledgement.",
    signal.code === "SYNTHETIC_OUTAGE" ? "SYNTHETIC TEST ONLY: No production outage." : "",
  ].filter(Boolean).join("\n");
  const sendOne = async (role: "primary" | "backup", to: string): Promise<Result> => {
    const idempotency = `w15-${signal.environment}-${signal.surface}-${signal.code}-${windowId}-${role}`;
    for (let i = 0; i < 2; i++) {
      try {
        const response = await fetcher("https://api.resend.com/emails", {
          method: "POST", signal: AbortSignal.timeout(4000),
          headers: {
            "Authorization": `Bearer ${key}`,
            "Content-Type": "application/json",
            "Idempotency-Key": idempotency,
          },
          body: JSON.stringify({ from, to: [to], subject, text: body }),
        });
        if (response.ok) {
          const receipt: unknown = await response.json().catch(() => null);
          return receipt && typeof receipt === "object" && "id" in receipt &&
            typeof receipt.id === "string" && receipt.id.length > 0 ? "accepted" : "failed";
        }
        if (response.status !== 429 && response.status < 500) return "failed";
      } catch {
        // One bounded retry; never serialize provider error or response body.
      }
    }
    return "failed";
  };
  const [primaryStatus, backupStatus] = await Promise.all([
    sendOne("primary", primary), sendOne("backup", backup),
  ]);
  const state = primaryStatus === "accepted" && backupStatus === "accepted" ? "accepted" :
    primaryStatus === "accepted" || backupStatus === "accepted" ? "partial" : "failed";
  (deps.sink ?? ((line: string) => console.error(line)))(JSON.stringify({
    event: "rythm_pilot_alert_delivery_v1", environment: signal.environment,
    surface: signal.surface, code: signal.code, windowStart: start,
    primary: primaryStatus, backup: backupStatus,
  }));
  return { state, primary: primaryStatus, backup: backupStatus };
}
