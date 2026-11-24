export const ANALYTICS_CONSENT_COOKIE = "rythm_analytics_consent_v2";

export function hasAnalyticsConsent(cookieHeader: string) {
  return cookieHeader.split(";").map((part) => part.trim()).some((part) => part === ANALYTICS_CONSENT_COOKIE + "=granted");
}

export function readAnalyticsConsent(): "granted" | "denied" | null {
  if (typeof document === "undefined") return null;
  const value = document.cookie.split(";").map((part) => part.trim()).find((part) => part.startsWith(ANALYTICS_CONSENT_COOKIE + "="))?.split("=")[1];
  return value === "granted" || value === "denied" ? value : null;
}
