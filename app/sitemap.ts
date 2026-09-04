import type { MetadataRoute } from "next";
import { absoluteUrl, PUBLIC_ROUTES } from "@/lib/seo/site";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    ...PUBLIC_ROUTES.map((route) => ({
      url: absoluteUrl(route.path),
      changeFrequency: route.changeFrequency,
      priority: route.priority,
    })),
    {
      url: absoluteUrl("/ai-company-operating-system"),
      changeFrequency: "monthly" as const,
      priority: 0.94,
    },
    {
      url: absoluteUrl("/ai-workforce-software"),
      changeFrequency: "monthly" as const,
      priority: 0.93,
    },
    {
      url: absoluteUrl("/compare/n8n"),
      changeFrequency: "monthly" as const,
      priority: 0.73,
    },
    {
      url: absoluteUrl("/compare/langgraph"),
      changeFrequency: "monthly" as const,
      priority: 0.73,
    },
    {
      url: absoluteUrl("/research/governed-ai-workforce-benchmark"),
      changeFrequency: "monthly" as const,
      priority: 0.76,
    },
    {
      url: absoluteUrl("/press"),
      changeFrequency: "monthly" as const,
      priority: 0.72,
    },
    {
      url: absoluteUrl("/status"),
      changeFrequency: "weekly" as const,
      priority: 0.62,
    },
  ];
}
