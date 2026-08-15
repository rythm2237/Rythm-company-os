import type { MetadataRoute } from "next";
import { absoluteUrl, PUBLIC_ROUTES } from "@/lib/seo/site";

const PUBLIC_SEARCH_RELEASE_DATE = new Date("2026-08-15T00:00:00.000Z");

const CONSUMER_LEGAL_ROUTES = [
  { path: "/consumer-rights", changeFrequency: "monthly" as const, priority: 0.5 },
  { path: "/consumer-terms", changeFrequency: "monthly" as const, priority: 0.5 },
  { path: "/withdrawal", changeFrequency: "monthly" as const, priority: 0.5 },
];

export default function sitemap(): MetadataRoute.Sitemap {
  return [...PUBLIC_ROUTES, ...CONSUMER_LEGAL_ROUTES].map((route) => ({
    url: absoluteUrl(route.path),
    lastModified: PUBLIC_SEARCH_RELEASE_DATE,
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }));
}
