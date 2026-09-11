import "server-only";
import { fetchPublicResource } from "@/lib/security/public-url";
import { redactSecretText } from "@/lib/security/redaction";

const CRAWLY_HOST = "www.getcrawly.com";
const CRAWLY_ENDPOINT = `https://${CRAWLY_HOST}/api/v1/backlinks`;
const DEFAULT_DOMAIN = "rythm-os.com";

type CrawlyBacklink = {
  source_domain?: unknown;
  link_count?: unknown;
  domain_rating?: unknown;
  pagerank_rank?: unknown;
};

type CrawlyResponse = {
  domain?: unknown;
  summary?: {
    referring_domains?: unknown;
    total_links?: unknown;
  };
  backlinks?: {
    total?: unknown;
    backlinks?: unknown;
  };
  score?: {
    harmonic_rank?: unknown;
    pagerank_rank?: unknown;
    host_count?: unknown;
  };
};

export type AuthoritySnapshot = {
  provider: "crawly";
  domain: string;
  fetchedAt: string;
  referringDomains: number | null;
  totalBacklinks: number | null;
  listedReferringDomains: number;
  topReferringDomains: Array<{
    domain: string;
    links: number | null;
    rating: string | null;
    pageRankRank: number | null;
  }>;
  authoritySignals: {
    harmonicRank: number | null;
    pageRankRank: number | null;
    hostCount: number | null;
  };
};

function finiteNumber(value: unknown) {
  const parsed = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

function cleanDomain(value: unknown) {
  if (typeof value !== "string") return null;
  const domain = value.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  return /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domain) ? domain : null;
}

export function normalizeCrawlyBacklinks(payload: CrawlyResponse, requestedDomain: string): AuthoritySnapshot {
  const rows = Array.isArray(payload.backlinks?.backlinks) ? payload.backlinks?.backlinks as CrawlyBacklink[] : [];
  const topReferringDomains = rows
    .map((row) => {
      const domain = cleanDomain(row.source_domain);
      if (!domain) return null;
      return {
        domain,
        links: finiteNumber(row.link_count),
        rating: typeof row.domain_rating === "string" ? row.domain_rating.slice(0, 32) : null,
        pageRankRank: finiteNumber(row.pagerank_rank),
      };
    })
    .filter((row): row is NonNullable<typeof row> => Boolean(row))
    .sort((a, b) => (b.links ?? 0) - (a.links ?? 0))
    .slice(0, 100);

  return {
    provider: "crawly",
    domain: cleanDomain(payload.domain) ?? requestedDomain,
    fetchedAt: new Date().toISOString(),
    referringDomains: finiteNumber(payload.summary?.referring_domains),
    totalBacklinks: finiteNumber(payload.summary?.total_links),
    listedReferringDomains: rows.length,
    topReferringDomains,
    authoritySignals: {
      harmonicRank: finiteNumber(payload.score?.harmonic_rank),
      pageRankRank: finiteNumber(payload.score?.pagerank_rank),
      hostCount: finiteNumber(payload.score?.host_count),
    },
  };
}

export async function runCrawlyAuthorityMonitoring(config: Record<string, unknown> | null | undefined) {
  const apiKey = process.env.CRAWLY_API_KEY?.trim();
  if (!apiKey) {
    return {
      status: "skipped" as const,
      summary: "Authority Monitoring is configured for Crawly but CRAWLY_API_KEY is not available.",
      output: {
        provider: "crawly",
        providerState: "CONFIGURATION_REQUIRED",
        requiredEnvironment: "CRAWLY_API_KEY",
      },
    };
  }

  const configuredDomain = cleanDomain(config?.domain) ?? DEFAULT_DOMAIN;
  const endpoint = new URL(CRAWLY_ENDPOINT);
  endpoint.searchParams.set("domain", configuredDomain);

  const { response, bytes } = await fetchPublicResource(endpoint, {
    allowedHosts: [CRAWLY_HOST],
    timeoutMs: 15_000,
    maxBytes: 2_000_000,
    maxRedirects: 0,
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
  });

  const raw = new TextDecoder().decode(bytes);
  if (!response.ok) {
    const safeBody = redactSecretText(raw).slice(0, 300);
    throw new Error(`Crawly backlink API returned HTTP ${response.status}${safeBody ? `: ${safeBody}` : ""}`);
  }

  let payload: CrawlyResponse;
  try {
    payload = JSON.parse(raw) as CrawlyResponse;
  } catch {
    throw new Error("Crawly backlink API returned invalid JSON.");
  }

  const snapshot = normalizeCrawlyBacklinks(payload, configuredDomain);
  if (snapshot.referringDomains == null && snapshot.totalBacklinks == null) {
    throw new Error("Crawly backlink API response did not include the expected backlink summary.");
  }

  return {
    summary: `Crawly authority snapshot: ${snapshot.referringDomains ?? "unknown"} referring domains and ${snapshot.totalBacklinks ?? "unknown"} backlinks.`,
    output: {
      providerState: "LIVE",
      ...snapshot,
    },
  };
}
