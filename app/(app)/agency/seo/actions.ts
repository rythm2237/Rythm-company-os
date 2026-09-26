"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOrganizationContext } from "@/lib/auth/organization-context";
import { collectSeoProviderEvidence } from "@/lib/integrations/adapters/seo-provider-analytics";
import { runSeoAiReasoning, runSeoIntelligenceAgent } from "@/lib/seo/intelligence-agent";
import { runSeoMonitoringEngine } from "@/lib/seo/monitoring-engine";
import { redactSecretText } from "@/lib/security/redaction";

const PATH = "/agency/seo";
const PROVIDERS = new Set(["google_search_console", "bing_webmaster"]);
type OrganizationContext = Awaited<ReturnType<typeof requireOrganizationContext>>;
type OrganizationSupabase = OrganizationContext["supabase"];

function normalizeSiteUrl(raw: string) {
  const value = raw.trim();
  const withProtocol = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  const url = new URL(withProtocol);
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("Website must use HTTP or HTTPS.");
  if (!url.hostname || url.username || url.password) throw new Error("Enter a valid public website URL.");
  url.hash = "";
  url.search = "";
  url.pathname = "";
  return url.toString().replace(/\/$/, "");
}

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
  supabase,
  organizationId,
  userId,
  siteId,
  siteUrl,
}: {
  supabase: OrganizationSupabase;
  organizationId: string;
  userId: string;
  siteId: string;
  siteUrl: string;
}) {
  const [{ data: existing, error: existingError }, { data: resources, error: resourcesError }] = await Promise.all([
    supabase.from("agency_seo_provider_bindings")
      .select("provider_key,integration_resource_id")
      .eq("organization_id", organizationId)
      .eq("site_id", siteId),
    supabase.from("integration_resources")
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
  const connected: string[] = [];

  for (const providerKey of ["google_search_console", "bing_webmaster"] as const) {
    if (existingProviders.has(providerKey)) continue;
    const match = candidates.find((resource) => resource.provider_key === providerKey && resourceMatchesSite(providerKey, resource.resource_id, siteUrl));
    if (!match) continue;

    const { error } = await supabase.from("agency_seo_provider_bindings").upsert({
      organization_id: organizationId,
      site_id: siteId,
      provider_key: providerKey,
      integration_resource_id: match.id,
      created_by_user_id: userId,
      updated_at: new Date().toISOString(),
    }, { onConflict: "site_id,provider_key" });
    if (error) throw new Error(error.message);
    connected.push(providerKey);
  }
  return connected;
}

function destination(siteId?: string | null, key: "message" | "error" = "message", value?: string) {
  const params = new URLSearchParams();
  if (siteId) params.set("site", siteId);
  if (value) params.set(key, value);
  return `${PATH}${params.size ? `?${params.toString()}` : ""}`;
}

export async function createAgencySeoSite(formData: FormData) {
  const { supabase, organizationId, user } = await requireOrganizationContext();
  let target = PATH;
  try {
    const siteUrl = normalizeSiteUrl(String(formData.get("siteUrl") ?? ""));
    const siteName = String(formData.get("siteName") ?? "").trim() || new URL(siteUrl).hostname;
    let accountId = String(formData.get("accountId") ?? "").trim();
    const newClientName = String(formData.get("clientName") ?? "").trim();

    if (accountId) {
      const { data: account } = await supabase.from("crm_accounts").select("id").eq("organization_id", organizationId).eq("id", accountId).maybeSingle();
      if (!account) throw new Error("Selected CRM client was not found in this organization.");
    } else {
      if (!newClientName) throw new Error("Select an existing CRM client or enter a new client name.");
      const { data: account, error: accountError } = await supabase.from("crm_accounts").insert({
        organization_id: organizationId,
        name: newClientName,
        lifecycle_stage: "customer",
        account_type: "company",
        website_url: siteUrl,
        created_by_user_id: user.id,
      }).select("id").single();
      if (accountError || !account) throw new Error(accountError?.message || "Client could not be created.");
      accountId = account.id;
    }

    const { data: site, error } = await supabase.from("agency_seo_sites").insert({
      organization_id: organizationId,
      crm_account_id: accountId,
      name: siteName,
      site_url: siteUrl,
      created_by_user_id: user.id,
    }).select("id").single();
    if (error || !site) throw new Error(error?.message || "SEO site could not be created.");

    const connected = await autoBindMatchingProviders({ supabase, organizationId, userId: user.id, siteId: site.id, siteUrl });
    const labels = connected.map((providerKey) => providerKey === "google_search_console" ? "Google Search Console" : "Bing Webmaster");
    revalidatePath(PATH);
    target = destination(site.id, "message", labels.length
      ? `Client website added. ${labels.join(" + ")} connected automatically. Analyze the website when ready.`
      : "Client website added. RYTHM will automatically connect matching search providers when they become available.");
  } catch (error) {
    target = destination(null, "error", redactSecretText(error instanceof Error ? error.message : "Client website could not be created."));
  }
  redirect(target);
}

export async function bindAgencySeoProvider(formData: FormData) {
  const { supabase, organizationId, user } = await requireOrganizationContext();
  const siteId = String(formData.get("siteId") ?? "").trim();
  const providerKey = String(formData.get("providerKey") ?? "").trim();
  const resourceId = String(formData.get("resourceId") ?? "").trim();
  let target = destination(siteId);
  try {
    if (!siteId || !PROVIDERS.has(providerKey)) throw new Error("Invalid SEO provider binding request.");
    const { data: site } = await supabase.from("agency_seo_sites").select("id").eq("organization_id", organizationId).eq("id", siteId).maybeSingle();
    if (!site) throw new Error("Client website was not found.");

    if (!resourceId) {
      const { error } = await supabase.from("agency_seo_provider_bindings").delete().eq("organization_id", organizationId).eq("site_id", siteId).eq("provider_key", providerKey);
      if (error) throw new Error(error.message);
      revalidatePath(PATH);
      target = destination(siteId, "message", "Provider binding removed.");
    } else {
      const { data: resource } = await supabase.from("integration_resources")
        .select("id,provider_key,available")
        .eq("organization_id", organizationId)
        .eq("id", resourceId)
        .eq("provider_key", providerKey)
        .eq("available", true)
        .maybeSingle();
      if (!resource) throw new Error("The selected provider resource is not verified or does not belong to this organization.");

      const { error } = await supabase.from("agency_seo_provider_bindings").upsert({
        organization_id: organizationId,
        site_id: siteId,
        provider_key: providerKey,
        integration_resource_id: resourceId,
        created_by_user_id: user.id,
        updated_at: new Date().toISOString(),
      }, { onConflict: "site_id,provider_key" });
      if (error) throw new Error(error.message);
      revalidatePath(PATH);
      target = destination(siteId, "message", `${providerKey === "google_search_console" ? "Google Search Console" : "Bing Webmaster"} connection updated.`);
    }
  } catch (error) {
    target = destination(siteId, "error", redactSecretText(error instanceof Error ? error.message : "Provider binding failed."));
  }
  redirect(target);
}

export async function runAgencySeoMonitoring(formData: FormData) {
  const { supabase, organizationId, user } = await requireOrganizationContext();
  const siteId = String(formData.get("siteId") ?? "").trim();
  let target = destination(siteId);
  try {
    const { data: site, error: siteError } = await supabase.from("agency_seo_sites")
      .select("id,name,site_url,crm_account_id,active")
      .eq("organization_id", organizationId)
      .eq("id", siteId)
      .maybeSingle();
    if (siteError || !site) throw new Error("Client website was not found.");
    if (!site.active) throw new Error("This client website is archived.");

    await autoBindMatchingProviders({ supabase, organizationId, userId: user.id, siteId, siteUrl: site.site_url });

    const { data: bindings, error: bindingError } = await supabase.from("agency_seo_provider_bindings")
      .select("provider_key,integration_resource_id")
      .eq("organization_id", organizationId)
      .eq("site_id", siteId);
    if (bindingError) throw new Error(bindingError.message);

    const resourceIds = (bindings ?? []).map((item) => item.integration_resource_id);
    const resourcesResult = resourceIds.length
      ? await supabase.from("integration_resources").select("id,provider_key,resource_id,available").eq("organization_id", organizationId).in("id", resourceIds)
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
    try {
      aiReasoning = await runSeoAiReasoning({ organizationId, actorUserId: user.id, snapshot, deterministicReport: intelligence, providerEvidence });
    } catch (error) {
      aiReasoningError = redactSecretText(error instanceof Error ? error.message : "AI reasoning was unavailable.");
    }

    const { error: saveError } = await supabase.from("agency_seo_snapshots").insert({
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
      created_by_user_id: user.id,
    });
    if (saveError) throw new Error(`SEO snapshot could not be saved: ${saveError.message}`);

    await supabase.from("audit_events").insert({
      organization_id: organizationId,
      actor_type: "user",
      actor_user_id: user.id,
      event_type: "agency.seo_monitoring_run",
      object_type: "agency_seo_site",
      object_id: siteId,
      risk_level: "low",
      payload: { crm_account_id: site.crm_account_id, site: snapshot.site, score: snapshot.score, google: providerEvidence.google.status, bing: providerEvidence.bing.status, ai: Boolean(aiReasoning) },
    });

    revalidatePath(PATH);
    const providerLabel = [providerEvidence.google.status === "connected" ? "Google" : null, providerEvidence.bing.status === "connected" ? "Bing" : null].filter(Boolean).join(" + ") || "technical-only";
    target = destination(siteId, "message", `Analysis completed: ${snapshot.score}/100 · ${providerLabel}${aiReasoning ? " · AI insights ready" : " · deterministic insights ready"}.`);
  } catch (error) {
    target = destination(siteId, "error", redactSecretText(error instanceof Error ? error.message : "Client SEO monitoring failed."));
  }
  redirect(target);
}