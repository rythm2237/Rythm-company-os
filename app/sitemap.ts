import type { MetadataRoute } from "next";
import { absoluteUrl, PUBLIC_ROUTES } from "@/lib/seo/site";

const PUBLIC_SEARCH_RELEASE_DATE = new Date("2026-08-14T00:00:00.000Z");

export default function sitemap(): MetadataRoute.Sitemap {
  return PUBLIC_ROUTES.map((route) => ({
    url: absoluteUrl(route.path),
    lastModified: PUBLIC_SEARCH_RELEASE_DATE,
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }));
}
