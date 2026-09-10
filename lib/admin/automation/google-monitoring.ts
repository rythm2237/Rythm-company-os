import "server-only";
import {
  GOOGLE_SEARCH_CONSOLE_PROPERTY,
  resolveGoogleSearchConsoleAccessToken,
} from "@/lib/admin/integrations/google-search-console";
import { executeJsonRequest, secureProviderUrl } from "@/lib/integrations/adapters/http";

const SITE_ORIGIN = "https://rythm-os.com";
const SEARCH_ANALYTICS_API = "https://searchconsole.googleapis.com/webmasters/v3/sites";
const URL_INSPECTION_API = "https://searchconsole.googleapis.com/v1/urlInspection/index:inspect";
const PAGESPEED_API = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed";

type SearchMetricRow = { clicks?: number; impressions?: number; ctr?: number; position?: number };
type SearchAnalyticsResponse = { rows?: SearchMetricRow[]; responseAggregationType?: string; metadata?: Record<string, unknown> };
type AutomationResult = { summary: string; output: Record<string, unknown> };

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number) {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function safeNumber(value: unknown, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function isCanonicalPublicUrl(value: string) {
  try {
    const url = new URL(value);
    return url.origin === SITE_ORIGIN && !url.pathname.startsWith("/admin") && !url.pathname.startsWith("/api/");
  } catch {
    return false;
  }
}

async function googleJson<T>(url: string, accessToken: string, init?: RequestInit): Promise<T> {
  const parsed = await secureProviderUrl(url, ["www.googleapis.com", "searchconsole.googleapis.com"]);
  const headers = new Headers(init?.headers);
  headers.set("Authorization", `Bearer ${accessToken}`);
  return executeJsonRequest(parsed, {
    ...init,
    headers,
  }, 30_000) as Promise<T>;
}

function summarizeSearchRow(response: SearchAnalyticsResponse) {
  const row = response.rows?.[0] ?? {};
  return {
    clicks: safeNumber(row.clicks),
    impressions: safeNumber(row.impressions),
    ctr: safeNumber(row.ctr),
    averagePosition: safeNumber(row.position),
  };
}

function changeEvidence(current: ReturnType<typeof summarizeSearchRow>, previous: ReturnType<typeof summarizeSearchRow>, threshold: number) {
  const changes: Array<Record<string, unknown>> = [];
  const candidates = [
    { metric: "clicks", current: current.clicks, previous: previous.clicks, minimumEvidence: current.clicks + previous.clicks >= 5 },
    { metric: "impressions", current: current.impressions, previous: previous.impressions, minimumEvidence: current.impressions + previous.impressions >= 20 },
    { metric: "ctr", current: current.ctr, previous: previous.ctr, minimumEvidence: current.impressions + previous.impressions >= 20 },
  ];
  for (const candidate of candidates) {
    if (!candidate.minimumEvidence || candidate.previous <= 0) continue;
    const relativeChange = (candidate.current - candidate.previous) / candidate.previous;
    if (Math.abs(relativeChange) >= threshold) changes.push({
      metric: candidate.metric,
      current: candidate.current,
      previous: candidate.previous,
      relativeChange,
      direction: relativeChange > 0 ? "increase" : "decrease",
    });
  }
  const positionDelta = current.averagePosition - previous.averagePosition;
  if (current.impressions + previous.impressions >= 20 && previous.averagePosition > 0 && Math.abs(positionDelta) >= 3) {
    changes.push({
      metric: "averagePosition",
      current: current.averagePosition,
      previous: previous.averagePosition,
      absoluteChange: positionDelta,
      direction: positionDelta < 0 ? "improved" : "declined",
    });
  }
  return changes;
}

async function searchAnalytics(accessToken: string, startDate: string, endDate: string) {
  const site = encodeURIComponent(GOOGLE_SEARCH_CONSOLE_PROPERTY);
  return googleJson<SearchAnalyticsResponse>(`${SEARCH_ANALYTICS_API}/${site}/searchAnalytics/query`, accessToken, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ startDate, endDate, type: "web", dataState: "final", aggregationType: "byProperty", rowLimit: 1 }),
  });
}

async function inspectUrl(accessToken: string, inspectionUrl: string) {
  try {
    const response = await googleJson<{
      inspectionResult?: {
        inspectionResultLink?: string;
        indexStatusResult?: Record<string, unknown>;
      };
    }>(URL_INSPECTION_API, accessToken, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ inspectionUrl, siteUrl: GOOGLE_SEARCH_CONSOLE_PROPERTY, languageCode: "en-US" }),
    });
    const status = response.inspectionResult?.indexStatusResult ?? {};
    return {
      url: inspectionUrl,
      verdict: status.verdict ?? "VERDICT_UNSPECIFIED",
      coverageState: status.coverageState ?? null,
      robotsTxtState: status.robotsTxtState ?? null,
      indexingState: status.indexingState ?? null,
      pageFetchState: status.pageFetchState ?? null,
      lastCrawlTime: status.lastCrawlTime ?? null,
      crawledAs: status.crawledAs ?? null,
      googleCanonical: status.googleCanonical ?? null,
      userCanonical: status.userCanonical ?? null,
      referringUrls: status.referringUrls ?? [],
      sitemap: status.sitemap ?? [],
      inspectionResultLink: response.inspectionResult?.inspectionResultLink ?? null,
    };
  } catch (error) {
    return { url: inspectionUrl, verdict: "ERROR", error: error instanceof Error ? error.message : "URL inspection failed." };
  }
}

export async function runSearchConsoleMonitoring(config: Record<string, unknown> | null): Promise<AutomationResult> {
  const accessToken = await resolveGoogleSearchConsoleAccessToken();
  const windowDays = Math.min(28, Math.max(1, safeNumber(config?.window_days, 7)));
  const threshold = Math.min(1, Math.max(0.1, safeNumber(config?.change_threshold, 0.3)));
  const finalEnd = addDays(new Date(), -3);
  const currentStart = addDays(finalEnd, -(windowDays - 1));
  const previousEnd = addDays(currentStart, -1);
  const previousStart = addDays(previousEnd, -(windowDays - 1));
  const monitoredUrls = (Array.isArray(config?.monitored_urls) ? config.monitored_urls : [`${SITE_ORIGIN}/`])
    .filter((value): value is string => typeof value === "string" && isCanonicalPublicUrl(value))
    .slice(0, 10);

  const site = encodeURIComponent(GOOGLE_SEARCH_CONSOLE_PROPERTY);
  const [currentResponse, previousResponse, sitemapResponse, inspections] = await Promise.all([
    searchAnalytics(accessToken, isoDate(currentStart), isoDate(finalEnd)),
    searchAnalytics(accessToken, isoDate(previousStart), isoDate(previousEnd)),
    googleJson<{ sitemap?: Array<Record<string, unknown>> }>(`${SEARCH_ANALYTICS_API}/${site}/sitemaps`, accessToken),
    Promise.all(monitoredUrls.map((url) => inspectUrl(accessToken, url))),
  ]);

  const current = summarizeSearchRow(currentResponse);
  const previous = summarizeSearchRow(previousResponse);
  const significantChanges = changeEvidence(current, previous, threshold);
  const indexedPass = inspections.filter((item) => item.verdict === "PASS").length;
  const indexingAnomalies = inspections.filter((item) => item.verdict !== "PASS");
  const sitemaps = (sitemapResponse.sitemap ?? []).map((item) => ({
    path: item.path ?? null,
    type: item.type ?? null,
    isPending: item.isPending ?? false,
    isSitemapsIndex: item.isSitemapsIndex ?? false,
    lastSubmitted: item.lastSubmitted ?? null,
    lastDownloaded: item.lastDownloaded ?? null,
    warnings: safeNumber(item.warnings),
    errors: safeNumber(item.errors),
    contents: item.contents ?? [],
  }));
  const sitemapAnomalies = sitemaps.filter((item) => item.isPending || item.warnings > 0 || item.errors > 0);

  return {
    summary: `Search Console: ${current.clicks} clicks, ${current.impressions} impressions, ${indexedPass}/${inspections.length} monitored URLs passed indexing checks.`,
    output: {
      source: { provider: "Google Search Console API", access: "OAuth read-only", property: GOOGLE_SEARCH_CONSOLE_PROPERTY },
      performance: {
        current: { startDate: isoDate(currentStart), endDate: isoDate(finalEnd), ...current },
        previous: { startDate: isoDate(previousStart), endDate: isoDate(previousEnd), ...previous },
        significantChanges,
        threshold,
      },
      indexing: { scope: "sampled_monitored_urls", indexedPass, totalInspected: inspections.length, results: inspections },
      sitemaps: { count: sitemaps.length, results: sitemaps },
      anomalies: { indexing: indexingAnomalies, sitemaps: sitemapAnomalies },
      collectedAt: new Date().toISOString(),
    },
  };
}

type PageSpeedMetric = { percentile?: number; category?: string; distributions?: Array<Record<string, unknown>> };
type PageSpeedExperience = { id?: string; overall_category?: string; initial_url?: string; metrics?: Record<string, PageSpeedMetric> };
type LighthouseAudit = { score?: number | null; numericValue?: number; numericUnit?: string; displayValue?: string; title?: string };
type PageSpeedResponse = {
  id?: string;
  loadingExperience?: PageSpeedExperience;
  originLoadingExperience?: PageSpeedExperience;
  lighthouseResult?: { categories?: { performance?: { score?: number | null } }; audits?: Record<string, LighthouseAudit>; fetchTime?: string };
  analysisUTCTimestamp?: string;
  error?: { message?: string };
};

function fieldMetric(experience: PageSpeedExperience | undefined, key: string, unit: "ms" | "score") {
  const metric = experience?.metrics?.[key];
  if (!metric) return null;
  return { percentile: metric.percentile ?? null, unit, category: metric.category ?? null, distributions: metric.distributions ?? [] };
}

function fieldEvidence(experience: PageSpeedExperience | undefined) {
  const metrics = {
    lcp: fieldMetric(experience, "LARGEST_CONTENTFUL_PAINT_MS", "ms"),
    inp: fieldMetric(experience, "INTERACTION_TO_NEXT_PAINT", "ms"),
    cls: fieldMetric(experience, "CUMULATIVE_LAYOUT_SHIFT_SCORE", "score"),
    fcp: fieldMetric(experience, "FIRST_CONTENTFUL_PAINT_MS", "ms"),
    ttfb: fieldMetric(experience, "EXPERIMENTAL_TIME_TO_FIRST_BYTE", "ms"),
  };
  const available = Object.values(metrics).some(Boolean);
  return {
    available,
    evidenceType: "CrUX real-user field data",
    overallCategory: experience?.overall_category ?? "NONE",
    metrics,
    unavailableReason: available ? null : "Google returned no eligible CrUX field data for this page/origin; insufficient traffic is possible.",
  };
}

function labAudit(audits: Record<string, LighthouseAudit> | undefined, key: string) {
  const audit = audits?.[key];
  if (!audit) return null;
  return { value: audit.numericValue ?? null, unit: audit.numericUnit ?? null, score: audit.score ?? null, displayValue: audit.displayValue ?? null };
}

async function pageSpeedRun(targetUrl: string, strategy: "mobile" | "desktop") {
  const apiKey = process.env.GOOGLE_PAGESPEED_API_KEY?.trim();
  if (!apiKey) throw new Error("GOOGLE_PAGESPEED_API_KEY is required for reliable PageSpeed monitoring.");
  const apiUrl = new URL(PAGESPEED_API);
  apiUrl.searchParams.set("url", targetUrl);
  apiUrl.searchParams.set("strategy", strategy);
  apiUrl.searchParams.set("category", "performance");
  apiUrl.searchParams.set("key", apiKey);
  const allowedUrl = await secureProviderUrl(apiUrl, ["www.googleapis.com"]);
  const body = await executeJsonRequest(allowedUrl, {}, 60_000) as PageSpeedResponse;
  const audits = body.lighthouseResult?.audits;
  return {
    strategy,
    analyzedUrl: body.id ?? targetUrl,
    source: "PageSpeed Insights v5",
    field: {
      page: fieldEvidence(body.loadingExperience),
      origin: fieldEvidence(body.originLoadingExperience),
    },
    lab: {
      evidenceType: "Lighthouse lab data",
      performanceScore: body.lighthouseResult?.categories?.performance?.score ?? null,
      lcp: labAudit(audits, "largest-contentful-paint"),
      inp: null,
      inpNote: "INP is reported only from CrUX field data; Lighthouse lab output does not fabricate it.",
      cls: labAudit(audits, "cumulative-layout-shift"),
      fcp: labAudit(audits, "first-contentful-paint"),
      ttfb: labAudit(audits, "server-response-time"),
      totalBlockingTime: labAudit(audits, "total-blocking-time"),
      fetchTime: body.lighthouseResult?.fetchTime ?? null,
    },
    analysisUTCTimestamp: body.analysisUTCTimestamp ?? null,
  };
}

export async function runCoreWebVitalsMonitoring(config: Record<string, unknown> | null): Promise<AutomationResult> {
  const configuredUrl = typeof config?.target_url === "string" ? config.target_url : `${SITE_ORIGIN}/`;
  if (!isCanonicalPublicUrl(configuredUrl)) throw new Error("Core Web Vitals target must be a public canonical rythm-os.com URL.");
  const requestedStrategies = Array.isArray(config?.strategies) ? config.strategies : ["mobile", "desktop"];
  const strategies = [...new Set(requestedStrategies.filter((value): value is "mobile" | "desktop" => value === "mobile" || value === "desktop"))];
  if (!strategies.length) strategies.push("mobile", "desktop");
  const runs = [];
  for (const strategy of strategies) runs.push(await pageSpeedRun(configuredUrl, strategy));
  const fieldAvailable = runs.filter((run) => run.field.page.available || run.field.origin.available).length;
  return {
    summary: `PageSpeed completed ${runs.length} strategy checks; CrUX field evidence was available for ${fieldAvailable}/${runs.length}.`,
    output: {
      targetUrl: configuredUrl,
      apiKeyConfigured: Boolean(process.env.GOOGLE_PAGESPEED_API_KEY?.trim()),
      evidenceBoundary: "CrUX field data and Lighthouse lab data are reported separately.",
      runs,
      collectedAt: new Date().toISOString(),
    },
  };
}
