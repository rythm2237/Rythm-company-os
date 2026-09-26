import "server-only";
import { createExecutionServiceClient } from "@/lib/integrations/service-runner";
import { resolveProviderCredential } from "@/lib/integrations/connections/provider-credentials";

export type SeoDailyPoint = { date: string; clicks: number; impressions: number; ctr?: number; position?: number };
export type SeoDimensionRow = { key: string; clicks: number; impressions: number; ctr?: number; position?: number };
export type SeoProviderEvidence = {
  collectedAt: string;
  google: {
    status: "connected" | "unavailable";
    property: string | null;
    daily: SeoDailyPoint[];
    queries: SeoDimensionRow[];
    pages: SeoDimensionRow[];
    devices: SeoDimensionRow[];
    inspection: { verdict?: string; coverageState?: string; indexingState?: string; pageFetchState?: string; googleCanonical?: string; userCanonical?: string; lastCrawlTime?: string } | null;
    error?: string;
  };
  bing: {
    status: "connected" | "unavailable";
    site: string | null;
    daily: SeoDailyPoint[];
    queries: SeoDimensionRow[];
    pages: SeoDimensionRow[];
    error?: string;
  };
};

export type SeoProviderSelection = {
  organizationId?: string | null;
  siteUrl?: string | null;
  googleProperty?: string | null;
  bingSite?: string | null;
};

type IntegrationRow = { id: string; organization_id: string; provider_key: string; status: string; enabled: boolean; metadata?: Record<string, unknown> | null };
type Json = Record<string, unknown>;

function isoDate(value: Date) { return value.toISOString().slice(0, 10); }
function num(value: unknown) { const n = Number(value ?? 0); return Number.isFinite(n) ? n : 0; }
function text(value: unknown) { return typeof value === "string" ? value : ""; }
function list(value: unknown): Json[] { return Array.isArray(value) ? value as Json[] : []; }
function bingDate(value: unknown) {
  const raw = text(value);
  const match = raw.match(/\/Date\((\d+)/);
  if (match) return isoDate(new Date(Number(match[1])));
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? isoDate(new Date(parsed)) : raw.slice(0, 10);
}
function providerError(error: unknown) { return error instanceof Error ? error.message.slice(0, 320) : "Provider evidence unavailable."; }

async function credentialFor(integration: IntegrationRow) {
  const service = createExecutionServiceClient();
  const { data, error } = await service.rpc("get_organization_integration_secret_service_v1", { target_integration_id: integration.id });
  if (error || !data) throw new Error(`${integration.provider_key} credential is unavailable.`);
  return resolveProviderCredential({ service, integrationId: integration.id, providerKey: integration.provider_key, storedSecret: String(data) });
}

function isVerifiedIntegration(integration: IntegrationRow) {
  if (!integration.enabled) return false;
  if (integration.status === "connected") return true;
  if (integration.status !== "verifying") return false;
  return integration.metadata?.verification_result === "verified" && integration.metadata?.setup_state === "verified";
}

async function findIntegration(providerKey: string, resourceId: string, organizationId?: string | null) {
  const service = createExecutionServiceClient();
  let resourceQuery = service.from("integration_resources")
    .select("integration_id,organization_id,resource_id,available")
    .eq("provider_key", providerKey)
    .eq("resource_id", resourceId)
    .eq("available", true);
  if (organizationId) resourceQuery = resourceQuery.eq("organization_id", organizationId);
  const { data: resource, error: resourceError } = await resourceQuery.order("last_verified_at", { ascending: false }).limit(1).maybeSingle();
  if (resourceError || !resource?.integration_id) return null;

  let integrationQuery = service.from("organization_integrations")
    .select("id,organization_id,provider_key,status,enabled,metadata")
    .eq("id", resource.integration_id)
    .eq("provider_key", providerKey)
    .eq("enabled", true);
  if (organizationId) integrationQuery = integrationQuery.eq("organization_id", organizationId);
  const { data: integration, error } = await integrationQuery.maybeSingle();
  if (error || !integration) return null;
  const row = integration as IntegrationRow;
  return isVerifiedIntegration(row) ? row : null;
}

async function googleJson(url: string, token: string, init: RequestInit = {}) {
  const response = await fetch(url, { ...init, headers: { Accept: "application/json", Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...init.headers }, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(20_000) });
  const body = await response.json().catch(() => ({})) as Json;
  if (!response.ok) throw new Error(`Google Search Console request failed (${response.status}).`);
  return body;
}

async function gscQuery(token: string, property: string, dimensions: string[], rowLimit = 100) {
  const end = new Date(); end.setUTCDate(end.getUTCDate() - 1);
  const start = new Date(end); start.setUTCDate(start.getUTCDate() - 27);
  const body = await googleJson(`https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(property)}/searchAnalytics/query`, token, {
    method: "POST",
    body: JSON.stringify({ startDate: isoDate(start), endDate: isoDate(end), dimensions, rowLimit, dataState: "final" }),
  });
  return list(body.rows);
}

function gscRows(rows: Json[]): SeoDimensionRow[] {
  return rows.map(row => ({ key: Array.isArray(row.keys) ? String(row.keys[0] ?? "") : "", clicks: num(row.clicks), impressions: num(row.impressions), ctr: num(row.ctr), position: num(row.position) })).filter(row => row.key);
}

async function collectGoogle(property: string | null, inspectionUrl: string, organizationId?: string | null): Promise<SeoProviderEvidence["google"]> {
  if (!property) return { status: "unavailable", property: null, daily: [], queries: [], pages: [], devices: [], inspection: null, error: "Google Search Console property is not bound to this site." };
  try {
    const integration = await findIntegration("google_search_console", property, organizationId);
    if (!integration) return { status: "unavailable", property, daily: [], queries: [], pages: [], devices: [], inspection: null, error: "Verified Google Search Console connection not found for this property." };
    const token = await credentialFor(integration);
    const [dailyRows, queryRows, pageRows, deviceRows, inspectionBody] = await Promise.all([
      gscQuery(token, property, ["date"], 100),
      gscQuery(token, property, ["query"], 20),
      gscQuery(token, property, ["page"], 20),
      gscQuery(token, property, ["device"], 10),
      googleJson("https://searchconsole.googleapis.com/v1/urlInspection/index:inspect", token, { method: "POST", body: JSON.stringify({ inspectionUrl, siteUrl: property, languageCode: "en-US" }) }).catch(() => null),
    ]);
    const inspectionResult = inspectionBody && typeof inspectionBody.inspectionResult === "object" ? inspectionBody.inspectionResult as Json : null;
    const indexStatus = inspectionResult && typeof inspectionResult.indexStatusResult === "object" ? inspectionResult.indexStatusResult as Json : null;
    return {
      status: "connected", property,
      daily: dailyRows.map(row => ({ date: String((row.keys as unknown[])?.[0] ?? ""), clicks: num(row.clicks), impressions: num(row.impressions), ctr: num(row.ctr), position: num(row.position) })).filter(row => row.date),
      queries: gscRows(queryRows), pages: gscRows(pageRows), devices: gscRows(deviceRows),
      inspection: indexStatus ? { verdict: text(indexStatus.verdict), coverageState: text(indexStatus.coverageState), indexingState: text(indexStatus.indexingState), pageFetchState: text(indexStatus.pageFetchState), googleCanonical: text(indexStatus.googleCanonical), userCanonical: text(indexStatus.userCanonical), lastCrawlTime: text(indexStatus.lastCrawlTime) } : null,
    };
  } catch (error) { return { status: "unavailable", property, daily: [], queries: [], pages: [], devices: [], inspection: null, error: providerError(error) }; }
}

async function bingJson(endpoint: string, token: string, site: string) {
  const url = new URL(`https://www.bing.com/webmaster/api.svc/json/${endpoint}`); url.searchParams.set("siteUrl", site);
  const response = await fetch(url, { headers: { Accept: "application/json", Authorization: `Bearer ${token}` }, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(20_000) });
  const body = await response.json().catch(() => ({})) as Json;
  if (!response.ok) throw new Error(`Bing Webmaster ${endpoint} failed (${response.status}).`);
  return list(body.d);
}

function bingRows(rows: Json[]): SeoDimensionRow[] {
  return rows.slice(0, 20).map(row => ({ key: text(row.Query || row.Url), clicks: num(row.Clicks), impressions: num(row.Impressions), position: num(row.AvgImpressionPosition || row.AvgClickPosition) })).filter(row => row.key);
}

async function collectBing(site: string | null, organizationId?: string | null): Promise<SeoProviderEvidence["bing"]> {
  if (!site) return { status: "unavailable", site: null, daily: [], queries: [], pages: [], error: "Bing Webmaster site is not bound to this site." };
  try {
    const integration = await findIntegration("bing_webmaster", site, organizationId);
    if (!integration) return { status: "unavailable", site, daily: [], queries: [], pages: [], error: "Verified Bing Webmaster connection not found for this site." };
    const token = await credentialFor(integration);
    const [traffic, queries, pages] = await Promise.all([bingJson("GetRankAndTrafficStats", token, site), bingJson("GetQueryStats", token, site), bingJson("GetPageStats", token, site)]);
    return { status: "connected", site, daily: traffic.map(row => ({ date: bingDate(row.Date), clicks: num(row.Clicks), impressions: num(row.Impressions) })).filter(row => row.date).sort((a,b) => a.date.localeCompare(b.date)).slice(-28), queries: bingRows(queries), pages: bingRows(pages) };
  } catch (error) { return { status: "unavailable", site, daily: [], queries: [], pages: [], error: providerError(error) }; }
}

export async function collectSeoProviderEvidence(selection: SeoProviderSelection = {}): Promise<SeoProviderEvidence> {
  const siteUrl = selection.siteUrl || "https://rythm-os.com/";
  const googleProperty = selection.googleProperty === undefined ? "sc-domain:rythm-os.com" : selection.googleProperty;
  const bingSite = selection.bingSite === undefined ? "https://rythm-os.com/" : selection.bingSite;
  const [google, bing] = await Promise.all([
    collectGoogle(googleProperty, siteUrl, selection.organizationId),
    collectBing(bingSite, selection.organizationId),
  ]);
  return { collectedAt: new Date().toISOString(), google, bing };
}
