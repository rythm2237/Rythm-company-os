"use client";

import { useEffect } from "react";
import {
  readPublicAttribution,
  trackPublicExperienceEvent,
  writePublicAttribution,
} from "@/lib/analytics/public-events";

const AI_REFERRERS = [
  { source: "chatgpt", hosts: ["chatgpt.com", "chat.openai.com"] },
  { source: "perplexity", hosts: ["perplexity.ai"] },
  { source: "gemini", hosts: ["gemini.google.com"] },
  { source: "microsoft_copilot", hosts: ["copilot.microsoft.com"] },
  { source: "claude", hosts: ["claude.ai"] },
] as const;

const ORGANIC_REFERRERS = [
  { source: "google", hosts: ["google.com"] },
  { source: "bing", hosts: ["bing.com"] },
  { source: "duckduckgo", hosts: ["duckduckgo.com"] },
  { source: "yahoo", hosts: ["search.yahoo.com"] },
  { source: "brave", hosts: ["search.brave.com"] },
  { source: "ecosia", hosts: ["ecosia.org"] },
] as const;

function identifySource(hostname: string) {
  const ai = AI_REFERRERS.find(({ hosts }) =>
    hosts.some((host) => hostname === host || hostname.endsWith(`.${host}`)),
  );
  if (ai) return { kind: "ai" as const, source: ai.source };

  const organic = ORGANIC_REFERRERS.find(({ hosts }) =>
    hosts.some((host) => hostname === host || hostname.endsWith(`.${host}`)),
  );
  return organic ? { kind: "organic" as const, source: organic.source } : null;
}

function recordConversionOnce(name: "demo_conversion" | "signup_conversion" | "enterprise_inquiry_conversion") {
  if (!readPublicAttribution()) return;
  const key = `rythm:${name}:recorded`;
  if (window.sessionStorage.getItem(key) === "true") return;
  window.sessionStorage.setItem(key, "true");
  trackPublicExperienceEvent({ name });
}

export default function PublicReferralObserver() {
  useEffect(() => {
    if (!readPublicAttribution() && document.referrer) {
      try {
        const referrer = new URL(document.referrer);
        const hostname = referrer.hostname.toLowerCase();
        const identified = identifySource(hostname);

        if (identified) {
          writePublicAttribution({
            kind: identified.kind,
            source: identified.source,
            landing_path: window.location.pathname,
            referrer_host: hostname,
          });
          trackPublicExperienceEvent({
            name: identified.kind === "ai" ? "ai_referral_detected" : "organic_referral_detected",
            properties: {
              engine: identified.source,
            },
          });
        }
      } catch {
        // Invalid or unavailable referrer values are ignored deliberately.
      }
    }

    if (window.location.pathname === "/demo") recordConversionOnce("demo_conversion");

    const onClick = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!(target instanceof HTMLAnchorElement)) return;

      const href = target.getAttribute("href") ?? "";
      if (href === "/demo" || href.startsWith("/demo?")) {
        recordConversionOnce("demo_conversion");
      } else if (href === "/signup" || href.startsWith("/signup?")) {
        recordConversionOnce("signup_conversion");
      } else if (window.location.pathname === "/enterprise" && href.toLowerCase().startsWith("mailto:")) {
        recordConversionOnce("enterprise_inquiry_conversion");
      }
    };

    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  return null;
}
