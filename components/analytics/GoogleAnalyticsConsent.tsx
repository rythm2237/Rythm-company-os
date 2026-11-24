"use client";

import { Button } from "@/components/ui/Button";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { ANALYTICS_CONSENT_COOKIE, readAnalyticsConsent } from "@/lib/analytics/consent";

const MEASUREMENT_ID = "G-R0VW9SY7Z9";
const CONSENT_COOKIE = ANALYTICS_CONSENT_COOKIE;
const ALLOWED_HOSTS = new Set(["rythm-os.com", "www.rythm-os.com"]);

type AnalyticsWindow = Window & {
  dataLayer?: unknown[];
  gtag?: (...args: unknown[]) => void;
  [key: `ga-disable-${string}`]: boolean | undefined;
};

function writeConsent(value: "granted" | "denied") {
  const maxAge = 60 * 60 * 24 * 180;
  document.cookie = `${CONSENT_COOKIE}=${value}; Path=/; Max-Age=${maxAge}; SameSite=Lax; Secure`;
}

function clearOptionalAnalyticsState() {
  (window as AnalyticsWindow)[`ga-disable-${MEASUREMENT_ID}`] = true;
  try {
    for (const key of Object.keys(window.sessionStorage)) {
      if (key === "rythm:public-attribution" || /^rythm:(demo|signup|enterprise_inquiry)_conversion:recorded$/.test(key)) window.sessionStorage.removeItem(key);
    }
  } catch { /* Browser storage may be unavailable. */ }
  const names = document.cookie.split(";").map((part) => part.trim().split("=")[0]).filter((name) => name === "_ga" || name.startsWith("_ga_") || name === "rythm_public_attribution" || name === "rythm_analytics_consent");
  for (const name of names) {
    for (const domain of ["", "; Domain=rythm-os.com", `; Domain=${window.location.hostname}`]) {
      document.cookie = `${name}=; Path=/; Max-Age=0; Secure; SameSite=Lax${domain}`;
    }
  }
}

function loadGoogleAnalytics() {
  if (!ALLOWED_HOSTS.has(window.location.hostname) || readAnalyticsConsent() !== "granted") return;
  if (document.querySelector(`script[data-rythm-ga4="${MEASUREMENT_ID}"]`)) return;

  const analyticsWindow = window as AnalyticsWindow;
  analyticsWindow.dataLayer = analyticsWindow.dataLayer ?? [];
  analyticsWindow.gtag = (...args: unknown[]) => analyticsWindow.dataLayer?.push(args);
  analyticsWindow.gtag("js", new Date());
  analyticsWindow.gtag("config", MEASUREMENT_ID, {
    anonymize_ip: true,
    send_page_view: true,
  });

  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${MEASUREMENT_ID}`;
  script.dataset.rythmGa4 = MEASUREMENT_ID;
  document.head.appendChild(script);
}

export default function GoogleAnalyticsConsent() {
  const [visible, setVisible] = useState(false);
  const [eligibleHost, setEligibleHost] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    if (!ALLOWED_HOSTS.has(window.location.hostname)) return;
    setEligibleHost(true);
    const consent = readAnalyticsConsent();
    if (consent === "granted") {
      loadGoogleAnalytics();
      return;
    }
    clearOptionalAnalyticsState();
    if (consent !== "denied") setVisible(true);
  }, []);

  if (!visible) return eligibleHost && pathname === "/cookies" ? (
    <div style={{ padding: 16, textAlign: "center" }}>
      <Button type="button" onClick={() => setVisible(true)}>Manage analytics preferences</Button>
    </div>
  ) : null;

  return (
    <aside
      aria-label="Analytics consent"
      style={{
        position: "fixed",
        left: "50%",
        bottom: 20,
        transform: "translateX(-50%)",
        zIndex: 10000,
        width: "min(720px, calc(100vw - 32px))",
        border: "1px solid rgba(148,163,184,.35)",
        borderRadius: 16,
        background: "rgba(15,23,42,.97)",
        color: "#f8fafc",
        boxShadow: "0 20px 60px rgba(2,6,23,.28)",
        padding: 18,
      }}
    >
      <div style={{ display: "flex", gap: 16, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}>
        <p style={{ margin: 0, maxWidth: 470, fontSize: 14, lineHeight: 1.55 }}>
          RYTHM uses optional Google Analytics and first-party website usage and referral analytics to understand traffic and improve the product. Accept or decline these analytics; essential service functions remain available. You can change your choice on the Cookie & Storage Notice.
        </p>
        <div style={{ display: "flex", gap: 10 }}>
          <Button
            type="button"
            onClick={() => {
              writeConsent("denied");
              clearOptionalAnalyticsState();
              window.location.reload();
            }}
            style={{ border: "1px solid rgba(148,163,184,.45)", borderRadius: 10, padding: "9px 14px", background: "transparent", color: "#f8fafc", cursor: "pointer" }}
          >
            Decline
          </Button>
          <Button
            type="button"
            onClick={() => {
              writeConsent("granted");
              window.location.reload();
            }}
            style={{ border: 0, borderRadius: 10, padding: "9px 14px", background: "#f8fafc", color: "#0f172a", fontWeight: 700, cursor: "pointer" }}
          >
            Accept analytics
          </Button>
        </div>
      </div>
    </aside>
  );
}
