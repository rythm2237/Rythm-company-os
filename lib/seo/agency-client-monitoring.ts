import "server-only";
import { createAnalyticsAdminClient } from "@/lib/supabase/analytics-admin";
import { collectSeoProviderEvidence, type SeoDailyPoint, type SeoProviderEvidence } from "@/lib/integrations/adapters/seo-provider-analytics";
import { runSeoAiReasoning, runSeoIntelligenceAgent, type SeoFinding } from "@/lib/seo/intelligence-agent";
import { runSeoMonitoringEngine, type SeoMonitoringSnapshot } from "@/lib/seo/monitoring-engine";
import { redactSecretText } from "@/lib/security/redaction";

type AdminClient = NonNullable<ReturnType<typeof createAnalyticsAdminClient>>;

export type AgencySeoRunTrigger = "manual" | "scheduled" | "system";
export type AgencySeoThresholds = {
  scoreDrop?: number;
  searchDropRatio?: number;
  minBaselineImpressions?: number;
  minBaselineClicks?: number;
};

type PreviousSnapshot = {
  id: string;
  score: number;
  counts: Record<string, number> | null;
  provider_evidence: SeoProviderEvidence | null;
  findings: SeoFinding[] | null;
  checked_at: string;
};

type AgencySeoAnomaly = {
  key: string;
  severity: "warning" | "critical";
  title: string;
  body: string;
};

const DEFAULT_THRESHOLDS: Required<AgencySeoThresholds> = {
  scoreDrop: 10,
  searchDropRatio: 0.3,
  minBaselineImpressions: 20,
  minBaselineClicks: 5,
};

function normalizeHost(value: string) {
  return value.trim().toLowerCase().replace(/^www\./, "").replace(/\.$/, "");
}

function resourceMatchesSite(providerKey: string, resourceId: string, siteUrl: string) {
  const siteHost = normalizeHost(new URL(siteUrl).hostname);
  if (providerKey === "google_search_console" && resourceId.toLowerCase().startsWith("sc-domain:")) {
    return normalizeHost(resourceId.slice("sc-domain:".length)) === siteHost;
  }
  try {
    return normalizeHost(new URL(resourceId).hostname) === siteHost;
  } catch {
    return false;
  }
}

async function autoBindMatchingProviders({
  admin,
  organizationId,
  actorUserId,
  siteId,
  siteUrl,
}: {
  admin: AdminClient;
  organizationId: string;
  actorUserId?: string | null;
  siteId: string;
  siteUrl: string;
}) {
  const [{ data: existing, error: existingError }, { data: resources, error: resourcesError }] = await Promise.all([
    admin.from("agency_seo_provider_bindings")
      .select("provider_key,integration_resource_id")
      .eq("organization_id", organizationId)
      .eq("site_id", siteId),
    admin.from("integration_resources")
      .select("id,provider_key,resource_id,available,last_verified_at")
      .eq("organization_id", organizationId)
      .eq("available", true)
      .in("provider_key", ["google_search_console", "bing_webmaster"]),
  ]);
  if (existingError) throw new Error(existingError.message);
  if (resourcesError) throw new Error(resourcesError.message);

  const existingProviders = new Set((existing ?? []).map((item) => item.provider_key));
  const candidates = [...(resources ?? [])].sort((a, b) => {
    const aTime = a.last_verified_at ? new Date(a.last_verified_at).getTime() : 0;
    const bTime = b.last_verified_at ? new Date(b.last_verified_at).getTime() : 0;
    return bTime - aTime;
  });

  for (const providerKey of ["google_search_console", "bing_webmaster"] as const) {
    if (existingProviders.has(providerKey)) continue;
    const match = candidates.find((resource) => resource.provider_key === providerKey && resourceMatchesSite(providerKey, resource.resource_id, siteUrl));
    if (!match) continue;

    const { error } = await admin.from("agency_seo_provider_bindings").upsert({
      organization_id: organizationId,
      site_id: siteId,
      provider_key: providerKey,
      integration_resource_id: match.id,
      created_by_user_id: actorUserId ?? null,
      updated_at: new Date().toISOString(),
    }, { onConflict: "site_id,provider_key" });
    if (error) throw new Error(error.message);
  }
}

function totals(points: SeoDailyPoint[]) {
  return points.reduce((acc, point) => ({
    clicks: acc.clicks + Number(point.clicks || 0),
    impressions: acc.impressions + Number(point.impressions || 0),
  }), { clicks: 0, impressions: 0 });
}

function recentWindows(points: SeoDailyPoint[]) {
  const ordered = [...points].filter((item) => item.date).sort((a, b) => a.date.localeCompare(b.date));
  const last14 = ordered.slice(-14);
  if (last14.length < 14) return null;
  return { previous: totals(last14.slice(0, 7)), current: totals(last14.slice(7)) };
}

function findingIds(findings: SeoFinding[] | null | undefined) {
  return new Set((findings ?? []).map((item) => item.id));
}

function detectAnomalies({
  snapshot,
  evidence,
  intelligenceFindings,
  previous,
  thresholds,
}: {
  snapshot: SeoMonitoringSnapshot;
  evidence: SeoProviderEvidence;
  intelligenceFindings: SeoFinding[];
  previous: PreviousSnapshot | null;
  thresholds: Required<AgencySeoThresholds>;
}) {
  const anomalies: AgencySeoAnomaly[] = [];
  if (previous && previous.score - snapshot.score >= thresholds.scoreDrop) {
    anomalies.push({
      key: "health-score-drop",
      severity: previous.score - snapshot.score >= 20 ? "critical" : "warning",
      title: "SEO health score dropped",
      body: `Technical health moved from ${previous.score}/100 to ${snapshot.score}/100.`,
    });
  }

  const previousFindings = findingIds(previous?.findings);
  for (const finding of intelligenceFindings) {
    if (!["critical", "high"].includes(finding.severity) || previousFindings.has(finding.id)) continue;
    anomalies.push({
      key: `new-${finding.id}`,
      severity: finding.severity === "critical" ? "critical" : "warning",
      title: `New SEO issue: ${finding.title}`,
      body: finding.explanation,
    });
  }

  if (previous?.provider_evidence) {
    if (previous.provider_evidence.google?.status === "connected" && evidence.google.status !== "connected") {
      anomalies.push({ key: "google-disconnected", severity: "critical", title: "Google Search Console data unavailable", body: evidence.google.error || "The previously connected Google Search Console source is unavailable." });
    }
    if (previous.provider_evidence.bing?.status === "connected" && evidence.bing.status !== "connected") {
      anomalies.push({ key: "bing-disconnected", severity: "warning", title: "Bing Webmaster data unavailable", body: evidence.bing.error || "The previously connected Bing Webmaster source is unavailable." });
    }
  }

  if (evidence.google.status === "connected") {
    const windows = recentWindows(evidence.google.daily);
    if (windows) {
      const impressionDrop = windows.previous.impressions >= thresholds.minBaselineImpressions
        && windows.current.impressions <= windows.previous.impressions * (1 - thresholds.searchDropRatio);
      const clickDrop = windows.previous.clicks >= thresholds.minBaselineClicks
        && windows.current.clicks <= windows.previous.clicks * (1 - thresholds.searchDropRatio);
      if (impressionDrop || clickDrop) {
        anomalies.push({
          key: "google-search-drop",
          severity: impressionDrop && clickDrop ? "critical" : "warning",
          title: "Search visibility dropped",
          body: `Google 7-day comparison: impressions ${windows.previous.impressions} → ${windows.current.impressions}; clicks ${windows.previous.clicks} → ${windows.current.clicks}.`,
        });
      }
    }
  }

  return anomalies;
}

async function notificationRecipient(admin: AdminClient, organizationId: string, preferredUserId?: string | null) {
  if (preferredUserId) return preferredUserId;
  const { data } = await admin.from("organization_members")
    .select("user_id,role,membership_status")
    .eq("organization_id", organizationId)
    .eq("membership_status", "active")
    .in("role", ["owner", "admin"])
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return data?.user_id ?? null;
}

async function createAnomalyNotification({
  admin,
  organizationId,
  siteId,
  siteName,
  userId,
  snapshotId,
  anomalies,
}: {
  admin: AdminClient;
  organizationId: string;
  siteId: string;
  siteName: string;
  userId: string | null;
  snapshotId: string;
  anomalies: AgencySeoAnomaly[];
}) {
  if (!userId || anomalies.length === 0) return false;
  const severity = anomalies.some((item) => item.severity === "critical") ? "critical" : "warning";
  const primary = anomalies[0];
  const extra = anomalies.length > 1 ? ` +${anomalies.length - 1} more` : "";
  const { error } = await admin.from("notifications").insert({
    organization_id: organizationId,
    user_id: userId,
    category: "agency_seo",
    severity,
    title: `${siteName}: ${primary.title}${extra}`,
    body: anomalies.map((item) => item.body).join(" ").slice(0, 1200),
    action_url: `/agency/seo?site=${encodeURIComponent(siteId)}`,
    source_type: "agency_seo_snapshot",
    source_id: snapshotId,
    dedupe_key: `agency-seo:${siteId}:${snapshotId}`,
  });
  if (error && error.code !== "23505") throw new Error(error.message);
  return !error;
}

export async function runAgencySeoSiteMonitoring({
  organizationId,
  siteId,
  actorUserId = null,
  trigger = "manual",
  thresholds: thresholdOverrides = {},
}: {
  organizationId: string;
  siteId: string;
  actorUserId?: string | null;
  trigger?: AgencySeoRunTrigger;
  thresholds?: AgencySeoThresholds;
}) {
  const admin = createAnalyticsAdminClient();
  if (!admin) throw new Error("Supabase service-role environment is unavailable.");
  const thresholds = { ...DEFAULT_THRESHOLDS, ...thresholdOverrides };

  const { data: site, error: siteError } = await admin.from("agency_seo_sites")
    .select("id,name,site_url,crm_account_id,active,created_by_user_id")
    .eq("organization_id", organizationId)
    .eq("id", siteId)
    .maybeSingle();
  if (siteError || !site) throw new Error("Client website was not found.");
  if (!site.active) throw new Error("This client website is archived.");

  const { data: previousData, error: previousError } = await admin.from("agency_seo_snapshots")
    .select("id,score,counts,provider_evidence,findings,checked_at")
    .eq("organization_id", organizationId)
    .eq("site_id", siteId)
    .order("checked_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (previousError) throw new Error(previousError.message);
  const previous = previousData as PreviousSnapshot | null;

  await autoBindMatchingProviders({ admin, organizationId, actorUserId, siteId, siteUrl: site.site_url });

  const { data: bindings, error: bindingError } = await admin.from("agency_seo_provider_bindings")
    .select("provider_key,integration_resource_id")
    .eq("organization_id", organizationId)
    .eq("site_id", siteId);
  if (bindingError) throw new Error(bindingError.message);

  const resourceIds = (bindings ?? []).map((item) => item.integration_resource_id);
  const resourcesResult = resourceIds.length
    ? await admin.from("integration_resources").select("id,provider_key,resource_id,available").eq("organization_id", organizationId).in("id", resourceIds)
    : { data: [], error: null };
  if (resourcesResult.error) throw new Error(resourcesResult.error.message);
  const resources = resourcesResult.data ?? [];
  const googleBinding = (bindings ?? []).find((item) => item.provider_key === "google_search_console");
  const bingBinding = (bindings ?? []).find((item) => item.provider_key === "bing_webmaster");
  const googleResource = resources.find((item) => item.id === googleBinding?.integration_resource_id && item.available);
  const bingResource = resources.find((item) => item.id === bingBinding?.integration_resource_id && item.available);

  const [snapshot, providerEvidence] = await Promise.all([
    runSeoMonitoringEngine(site.site_url, { includeIndexNow: false }),
    collectSeoProviderEvidence({
      organizationId,
      siteUrl: `${site.site_url.replace(/\/$/, "")}/`,
      googleProperty: googleResource?.resource_id ?? null,
      bingSite: bingResource?.resource_id ?? null,
    }),
  ]);
  const intelligence = runSeoIntelligenceAgent(snapshot);

  let aiReasoning: Awaited<ReturnType<typeof runSeoAiReasoning>> | null = null;
  let aiReasoningError: string | null = null;
  const aiActorUserId = actorUserId ?? site.created_by_user_id ?? null;
  if (aiActorUserId) {
    try {
      aiReasoning = await runSeoAiReasoning({ organizationId, actorUserId: aiActorUserId, snapshot, deterministicReport: intelligence, providerEvidence });
    } catch (error) {
      aiReasoningError = redactSecretText(error instanceof Error ? error.message : "AI reasoning was unavailable.");
    }
  } else {
    aiReasoningError = "AI reasoning skipped because no authorized user actor is associated with this client site.";
  }

  const { data: savedSnapshot, error: saveError } = await admin.from("agency_seo_snapshots").insert({
    organization_id: organizationId,
    site_id: siteId,
    checked_at: snapshot.checkedAt,
    duration_ms: snapshot.durationMs,
    score: snapshot.score,
    counts: snapshot.counts,
    checks: snapshot.checks,
    provider_evidence: providerEvidence,
    intelligence_summary: intelligence.summary,
    findings: intelligence.findings,
    guardrails: intelligence.guardrails,
    ai_reasoning: aiReasoning?.outputText ?? null,
    ai_correlation_id: aiReasoning?.correlationId ?? null,
    ai_routing_mode: aiReasoning?.routingMode ?? null,
    ai_model: aiReasoning?.model ?? null,
    ai_reasoning_error: aiReasoningError,
    created_by_user_id: actorUserId ?? null,
  }).select("id").single();
  if (saveError || !savedSnapshot) throw new Error(`SEO snapshot could not be saved: ${saveError?.message ?? "unknown error"}`);

  const anomalies = detectAnomalies({ snapshot, evidence: providerEvidence, intelligenceFindings: intelligence.findings, previous, thresholds });
  const recipient = trigger === "scheduled" ? await notificationRecipient(admin, organizationId, site.created_by_user_id) : null;
  const notified = trigger === "scheduled"
    ? await createAnomalyNotification({ admin, organizationId, siteId, siteName: site.name, userId: recipient, snapshotId: savedSnapshot.id, anomalies })
    : false;

  await admin.from("audit_events").insert({
    organization_id: organizationId,
    actor_type: trigger === "scheduled" ? "system" : "user",
    actor_user_id: trigger === "scheduled" ? null : actorUserId,
    event_type: trigger === "scheduled" ? "agency.seo_monitoring_scheduled" : "agency.seo_monitoring_run",
    object_type: "agency_seo_site",
    object_id: siteId,
    risk_level: "low",
    payload: {
      crm_account_id: site.crm_account_id,
      site: snapshot.site,
      score: snapshot.score,
      google: providerEvidence.google.status,
      bing: providerEvidence.bing.status,
      ai: Boolean(aiReasoning),
      anomaly_count: anomalies.length,
      notification_created: notified,
    },
  });

  return {
    snapshotId: savedSnapshot.id,
    siteId,
    siteName: site.name,
    siteUrl: site.site_url,
    score: snapshot.score,
    googleStatus: providerEvidence.google.status,
    bingStatus: providerEvidence.bing.status,
    aiReady: Boolean(aiReasoning),
    anomalyCount: anomalies.length,
    anomalies,
    notificationCreated: notified,
  };
}
