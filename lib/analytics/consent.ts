export const ANALYTICS_CONSENT_COOKIE = "rythm_analytics_consent_v2";

export function parseAnalyticsConsent(cookieHeader: string): "granted" | "denied" | null {
  const matches = cookieHeader.split(";").map((part) => part.trim())
    .filter((part) => part.startsWith(ANALYTICS_CONSENT_COOKIE + "="));
  if (matches.length !== 1) return null;
  const value = matches[0].slice(ANALYTICS_CONSENT_COOKIE.length + 1);
  return value === "granted" || value === "denied" ? value : null;
}

export function hasAnalyticsConsent(cookieHeader: string) {
  return parseAnalyticsConsent(cookieHeader) === "granted";
}

export function readAnalyticsConsent(): "granted" | "denied" | null {
  return typeof document === "undefined" ? null : parseAnalyticsConsent(document.cookie);
}
