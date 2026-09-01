import type { MetadataRoute } from "next";
import { SITE_ORIGIN } from "@/lib/seo/site";

const NON_PUBLIC_PATHS = [
  "/api/",
  "/auth/callback/",
  "/organization-context/",
  "/actions/",
  "/activation/",
  "/agents/",
  "/approvals/",
  "/attention/",
  "/billing/",
  "/calendar/",
  "/command-center/",
  "/communication/",
  "/company/",
  "/company-library/",
  "/crm/",
  "/decisions/",
  "/evaluations/",
  "/executive-review/",
  "/finance/",
  "/ideas/",
  "/integrations/",
  "/meetings/",
  "/notifications/",
  "/onboarding/",
  "/operations/",
  "/orchestrator/",
  "/projects/",
  "/readiness/",
  "/runtime/",
  "/setup/",
  "/studio/",
  "/workflow/",
  "/login",
  "/signup",
  "/forgot-password",
  "/reset-password",
];
const SEARCH_AND_ANSWER_CRAWLERS = [
  "Googlebot",
  "Bingbot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "PerplexityBot",
  "Perplexity-User",
  "Claude-SearchBot",
  "Claude-User",
  "GPTBot",
  "ClaudeBot",
] as const;

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: NON_PUBLIC_PATHS,
      },
      ...SEARCH_AND_ANSWER_CRAWLERS.map((userAgent) => ({
        userAgent,
        allow: "/",
        disallow: NON_PUBLIC_PATHS,
      })),
    ],
    sitemap: `${SITE_ORIGIN}/sitemap.xml`,
    host: SITE_ORIGIN,
  };
}
