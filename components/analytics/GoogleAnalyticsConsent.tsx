"use client";

import { useEffect, useState } from "react";

const MEASUREMENT_ID = "G-R0VW9SY7Z9";
const CONSENT_COOKIE = "rythm_analytics_consent";
const ALLOWED_HOSTS = new Set(["rythm-os.com", "www.rythm-os.com"]);

type AnalyticsWindow = Window & {
  dataLayer?: unknown[];
  gtag?: (...args: unknown[]) => void;
};

function readConsent() {
  if (typeof document === "undefined") return null;
  const item = document.cookie
    .split(";")
    .map((value) => value.trim())
    .find((value) => value.startsWith(`${CONSENT_COOKIE}=`));
  return item?.split("=")[1] ?? null;
}

function writeConsent(value: "granted" | "denied") {
  const maxAge = 60 * 60 * 24 * 180;
  document.cookie = `${CONSENT_COOKIE}=${value}; Path=/; Max-Age=${maxAge}; SameSite=Lax; Secure`;
}

function loadGoogleAnalytics() {
  if (!ALLOWED_HOSTS.has(window.location.hostname)) return;
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

  useEffect(() => {
    if (!ALLOWED_HOSTS.has(window.location.hostname)) return;
    const consent = readConsent();
    if (consent === "granted") {
      loadGoogleAnalytics();
      return;
    }
    if (consent !== "denied") setVisible(true);
  }, []);

  if (!visible) return null;

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
          RYTHM uses Google Analytics to understand website traffic and improve the product. Analytics runs only after you consent.
        </p>
        <div style={{ display: "flex", gap: 10 }}>
          <button
            type="button"
            onClick={() => {
              writeConsent("denied");
              setVisible(false);
            }}
            style={{ border: "1px solid rgba(148,163,184,.45)", borderRadius: 10, padding: "9px 14px", background: "transparent", color: "#f8fafc", cursor: "pointer" }}
          >
            Decline
          </button>
          <button
            type="button"
            onClick={() => {
              writeConsent("granted");
              loadGoogleAnalytics();
              setVisible(false);
            }}
            style={{ border: 0, borderRadius: 10, padding: "9px 14px", background: "#f8fafc", color: "#0f172a", fontWeight: 700, cursor: "pointer" }}
          >
            Accept analytics
          </button>
        </div>
      </div>
    </aside>
  );
}
