import "server-only";
import { fetchPublicResource } from "@/lib/security/public-url";
import { redactSecretText } from "@/lib/security/redaction";

const CRAWLY_HOST = "www.getcrawly.com";
const CRAWLY_BASE = `https://${CRAWLY_HOST}/api/v1`;
const DEFAULT_DOMAIN = "rythm-os.com";
// Runtime credentials are read per invocation; production env changes require a fresh deployment.

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
  error?: unknown;
  message?: unknown;
  status?: unknown;
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

function normalizeRows(payload: CrawlyResponse) {
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

  return { rows, topReferringDomains };
}

function safeProviderMessage(payload: CrawlyResponse) {
  const candidate = typeof payload.message === "string" ? payload.message : typeof payload.error === "string" ? payload.error : null;
  return candidate ? redactSecretText(candidate).slice(0, 200) : null;
}

export function normalizeCrawlyBacklinks(summaryPayload: CrawlyResponse, backlinkPayload: CrawlyResponse | null, requestedDomain: string): AuthoritySnapshot {
  const detailPayload = backlinkPayload ?? {};
  const { rows, topReferringDomains } = normalizeRows(detailPayload);

  return {
    provider: "crawly",
    domain: cleanDomain(summaryPayload.domain) ?? cleanDomain(detailPayload.domain) ?? requestedDomain,
    fetchedAt: new Date().toISOString(),
    referringDomains: finiteNumber(summaryPayload.summary?.referring_domains) ?? finiteNumber(detailPayload.summary?.referring_domains),
    totalBacklinks: finiteNumber(summaryPayload.summary?.total_links) ?? finiteNumber(detailPayload.summary?.total_links),
    listedReferringDomains: rows.length,
    topReferringDomains,
    authoritySignals: {
      harmonicRank: finiteNumber(summaryPayload.score?.harmonic_rank) ?? finiteNumber(detailPayload.score?.harmonic_rank),
      pageRankRank: finiteNumber(summaryPayload.score?.pagerank_rank) ?? finiteNumber(detailPayload.score?.pagerank_rank),
      hostCount: finiteNumber(summaryPayload.score?.host_count) ?? finiteNumber(detailPayload.score?.host_count),
    },
  };
}

async function fetchCrawlyJson(path: "domain-authority" | "backlinks", domain: string, apiKey: string) {
  const endpoint = new URL(`${CRAWLY_BASE}/${path}`);
  endpoint.searchParams.set("domain", domain);

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
    throw new Error(`Crawly ${path} API returned HTTP ${response.status}${safeBody ? `: ${safeBody}` : ""}`);
  }

  try {
    return JSON.parse(raw) as CrawlyResponse;
  } catch {
    throw new Error(`Crawly ${path} API returned invalid JSON.`);
  }
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

  // Use domain-authority as the canonical summary endpoint. The backlinks endpoint is optional detail enrichment
  // because Crawly may return a reduced backlink payload for domains with sparse or not-yet-expanded link profiles.
  const summaryPayload = await fetchCrawlyJson("domain-authority", configuredDomain, apiKey);

  let backlinkPayload: CrawlyResponse | null = null;
  let detailWarning: string | null = null;
  try {
    backlinkPayload = await fetchCrawlyJson("backlinks", configuredDomain, apiKey);
  } catch (error) {
    detailWarning = error instanceof Error ? redactSecretText(error.message).slice(0, 300) : "Backlink detail endpoint unavailable.";
  }

  const snapshot = normalizeCrawlyBacklinks(summaryPayload, backlinkPayload, configuredDomain);
  const hasSummary = snapshot.referringDomains != null || snapshot.totalBacklinks != null;

  if (!hasSummary) {
    return {
      summary: `Crawly is reachable, but no indexed backlink summary is currently available for ${configuredDomain}.`,
      output: {
        providerState: "LIVE_NO_DATA",
        detailState: detailWarning ? "PARTIAL" : "NO_DATA",
        detailWarning,
        providerMessage: safeProviderMessage(summaryPayload) ?? safeProviderMessage(backlinkPayload ?? {}),
        responseKeys: Object.keys(summaryPayload).slice(0, 20),
        ...snapshot,
      },
    };
  }

  return {
    summary: `Crawly authority snapshot: ${snapshot.referringDomains ?? "unknown"} referring domains and ${snapshot.totalBacklinks ?? "unknown"} backlinks.`,
    output: {
      providerState: "LIVE",
      detailState: detailWarning ? "PARTIAL" : "LIVE",
      detailWarning,
      ...snapshot,
    },
  };
}
