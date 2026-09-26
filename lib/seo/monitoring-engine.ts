import { executePublicTextRequest } from "@/lib/integrations/adapters/http";
import { verifyIndexNowKey } from "@/lib/integrations/adapters/indexnow";

const DEFAULT_SITE = "https://rythm-os.com";
const REQUEST_TIMEOUT_MS = 10_000;

export type SeoCheckStatus = "pass" | "warning" | "fail" | "unavailable";
export type SeoCheckCategory = "availability" | "indexing" | "crawl" | "metadata" | "structured_data" | "discovery";
export type SeoMonitoringOptions = { includeIndexNow?: boolean };

export type SeoCheck = {
  id: string;
  category: SeoCheckCategory;
  status: SeoCheckStatus;
  title: string;
  detail: string;
  url?: string;
  metric?: number | string | null;
};

export type SeoMonitoringSnapshot = {
  version: "seo-monitor-v1";
  site: string;
  checkedAt: string;
  durationMs: number;
  score: number;
  counts: Record<SeoCheckStatus, number>;
  checks: SeoCheck[];
};

async function fetchText(url: string, allowedHost: string) {
  return executePublicTextRequest(url, [allowedHost], { headers: { "user-agent": "RYTHM-SEO-Monitor/1.0" } }, REQUEST_TIMEOUT_MS);
}

function canonicalFromHtml(html: string) {
  return html.match(/<link[^>]+rel=["'][^"']*canonical[^"']*["'][^>]+href=["']([^"']+)["']/i)?.[1]
    ?? html.match(/<link[^>]+href=["']([^"']+)["'][^>]+rel=["'][^"']*canonical[^"']*["']/i)?.[1]
    ?? null;
}

function normalizeCanonical(value: string | null, base: string) {
  if (!value) return null;
  try {
    const url = new URL(value, base);
    url.hash = "";
    url.search = "";
    if (url.pathname === "/") url.pathname = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return value.trim().replace(/\/$/, "");
  }
}

function titleFromHtml(html: string) {
  return html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/\s+/g, " ").trim() ?? null;
}

function descriptionFromHtml(html: string) {
  return html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)?.[1]
    ?? html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i)?.[1]
    ?? null;
}

function hasJsonLd(html: string) {
  return /<script[^>]+type=["']application\/ld\+json["'][^>]*>/i.test(html);
}

function scoreChecks(checks: SeoCheck[]) {
  const weights: Record<SeoCheckStatus, number> = { pass: 1, warning: 0.55, unavailable: 0.35, fail: 0 };
  if (!checks.length) return 0;
  return Math.round((checks.reduce((sum, check) => sum + weights[check.status], 0) / checks.length) * 100);
}

function counts(checks: SeoCheck[]): Record<SeoCheckStatus, number> {
  return checks.reduce<Record<SeoCheckStatus, number>>(
    (acc, item) => ({ ...acc, [item.status]: acc[item.status] + 1 }),
    { pass: 0, warning: 0, fail: 0, unavailable: 0 },
  );
}

export async function runSeoMonitoringEngine(site = DEFAULT_SITE, options: SeoMonitoringOptions = {}): Promise<SeoMonitoringSnapshot> {
  const started = Date.now();
  const parsedSite = new URL(site);
  if (!["http:", "https:"].includes(parsedSite.protocol)) throw new Error("SEO monitoring only supports HTTP(S) sites.");
  const origin = parsedSite.origin;
  const allowedHost = parsedSite.hostname;
  const checks: SeoCheck[] = [];

  try {
    const { response, text } = await fetchText(`${origin}/`, allowedHost);
    checks.push({ id: "homepage.http", category: "availability", status: response.ok ? "pass" : "fail", title: "Homepage availability", detail: `Homepage returned HTTP ${response.status}.`, url: response.url, metric: response.status });

    const canonical = canonicalFromHtml(text);
    const expectedCanonical = `${origin}/`;
    const normalizedCanonical = normalizeCanonical(canonical, expectedCanonical);
    const normalizedExpected = normalizeCanonical(expectedCanonical, expectedCanonical);
    checks.push({ id: "homepage.canonical", category: "indexing", status: normalizedCanonical === normalizedExpected ? "pass" : canonical ? "warning" : "fail", title: "Homepage canonical", detail: canonical ? `Canonical is ${canonical}.` : "No canonical link was detected in the homepage HTML.", url: expectedCanonical, metric: canonical });

    const title = titleFromHtml(text);
    checks.push({ id: "homepage.title", category: "metadata", status: title && title.length >= 20 && title.length <= 65 ? "pass" : title ? "warning" : "fail", title: "Page title", detail: title ? `Title length is ${title.length} characters.` : "No HTML title was detected.", url: expectedCanonical, metric: title?.length ?? null });

    const description = descriptionFromHtml(text);
    checks.push({ id: "homepage.description", category: "metadata", status: description && description.length >= 70 && description.length <= 180 ? "pass" : description ? "warning" : "fail", title: "Meta description", detail: description ? `Description length is ${description.length} characters.` : "No meta description was detected.", url: expectedCanonical, metric: description?.length ?? null });

    checks.push({ id: "homepage.jsonld", category: "structured_data", status: hasJsonLd(text) ? "pass" : "warning", title: "JSON-LD structured data", detail: hasJsonLd(text) ? "At least one JSON-LD block is present." : "No JSON-LD block was detected on the homepage.", url: expectedCanonical });
  } catch (error) {
    checks.push({ id: "homepage.http", category: "availability", status: "fail", title: "Homepage availability", detail: error instanceof Error ? error.message : "Homepage could not be fetched.", url: `${origin}/` });
  }

  try {
    const { response, text } = await fetchText(`${origin}/robots.txt`, allowedHost);
    const blocksAll = /user-agent:\s*\*[\s\S]*?disallow:\s*\/\s*(?:\r?\n|$)/i.test(text);
    checks.push({ id: "robots.http", category: "crawl", status: response.ok && !blocksAll ? "pass" : response.ok ? "fail" : "warning", title: "robots.txt", detail: blocksAll ? "robots.txt appears to block all crawling." : `robots.txt returned HTTP ${response.status}.`, url: `${origin}/robots.txt`, metric: response.status });
  } catch (error) {
    checks.push({ id: "robots.http", category: "crawl", status: "unavailable", title: "robots.txt", detail: error instanceof Error ? error.message : "robots.txt could not be checked.", url: `${origin}/robots.txt` });
  }

  try {
    const { response, text } = await fetchText(`${origin}/sitemap.xml`, allowedHost);
    const looksLikeSitemap = /<(urlset|sitemapindex)[\s>]/i.test(text);
    checks.push({ id: "sitemap.http", category: "indexing", status: response.ok && looksLikeSitemap ? "pass" : response.ok ? "warning" : "fail", title: "XML sitemap", detail: response.ok ? (looksLikeSitemap ? "Sitemap is reachable and has a recognized XML root." : "Sitemap is reachable but its XML root was not recognized.") : `Sitemap returned HTTP ${response.status}.`, url: `${origin}/sitemap.xml`, metric: response.status });
  } catch (error) {
    checks.push({ id: "sitemap.http", category: "indexing", status: "unavailable", title: "XML sitemap", detail: error instanceof Error ? error.message : "Sitemap could not be checked.", url: `${origin}/sitemap.xml` });
  }

  if (options.includeIndexNow !== false) {
    try {
      const key = await verifyIndexNowKey();
      checks.push({ id: "indexnow.key", category: "discovery", status: key.verified ? "pass" : "fail", title: "IndexNow ownership", detail: key.verified ? `Ownership key verified with HTTP ${key.status}.` : `Ownership key verification returned HTTP ${key.status || "unreachable"}.`, metric: key.status });
    } catch (error) {
      checks.push({ id: "indexnow.key", category: "discovery", status: "unavailable", title: "IndexNow ownership", detail: error instanceof Error ? error.message : "IndexNow ownership could not be checked." });
    }
  }

  return { version: "seo-monitor-v1", site: origin, checkedAt: new Date().toISOString(), durationMs: Date.now() - started, score: scoreChecks(checks), counts: counts(checks), checks };
}
