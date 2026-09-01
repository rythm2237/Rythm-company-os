"use client";

import { useEffect } from "react";
import { trackPublicExperienceEvent } from "@/lib/analytics/public-events";

const SESSION_KEY = "rythm:ai-referral-recorded";

const AI_REFERRERS = [
  { engine: "chatgpt", hosts: ["chatgpt.com", "chat.openai.com"] },
  { engine: "perplexity", hosts: ["perplexity.ai"] },
  { engine: "gemini", hosts: ["gemini.google.com"] },
  { engine: "microsoft_copilot", hosts: ["copilot.microsoft.com"] },
  { engine: "claude", hosts: ["claude.ai"] },
] as const;

function identifyAiReferrer(hostname: string) {
  return AI_REFERRERS.find(({ hosts }) =>
    hosts.some((host) => hostname === host || hostname.endsWith(`.${host}`)),
  )?.engine;
}

export default function PublicReferralObserver() {
  useEffect(() => {
    if (!document.referrer || window.sessionStorage.getItem(SESSION_KEY) === "true") return;

    try {
      const referrer = new URL(document.referrer);
      const engine = identifyAiReferrer(referrer.hostname.toLowerCase());
      if (!engine) return;

      window.sessionStorage.setItem(SESSION_KEY, "true");
      trackPublicExperienceEvent({
        name: "ai_referral_detected",
        properties: {
          engine,
          landing_path: window.location.pathname,
          referrer_host: referrer.hostname.toLowerCase(),
        },
      });
    } catch {
      // Invalid or unavailable referrer values are ignored deliberately.
    }
  }, []);

  return null;
}
