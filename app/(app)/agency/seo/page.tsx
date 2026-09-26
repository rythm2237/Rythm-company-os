import Link from "next/link";
import { requireOrganizationContext } from "@/lib/auth/organization-context";
import { bindAgencySeoProvider, createAgencySeoSite, runAgencySeoMonitoring } from "./actions";
import "@/app/agency-seo.css";

export const dynamic = "force-dynamic";

type Account = { id: string; name: string; website_url: string | null; lifecycle_stage: string };
type Site = { id: string; crm_account_id: string; name: string; site_url: string; active: boolean; created_at: string };
type Binding = { site_id: string; provider_key: string; integration_resource_id: string };
type Resource = { id: string; provider_key: string; resource_id: string; resource_name: string; resource_type: string; available: boolean };
type Snapshot = { id: string; site_id: string; checked_at: string; duration_ms: number; score: number; counts: unknown; checks: unknown; provider_evidence: unknown; intelligence_summary: string | null; findings: unknown; ai_reasoning: string | null; ai_model: string | null; ai_reasoning_error: string | null };
type Props = { searchParams: Promise<{ site?: string; message?: string; error?: string }> };
type Json = Record<string, unknown>;

type Point = { date: string; clicks: number; impressions: number; ctr?: number; position?: number };
type Row = { key: string; clicks: number; impressions: number; ctr?: number; position?: number };

const obj = (value: unknown): Json => value && typeof value === "object" && !Array.isArray(value) ? value as Json : {};
const arr = (value: unknown): Json[] => Array.isArray(value) ? value.filter((item): item is Json => Boolean(item) && typeof item === "object" && !Array.isArray(item)) : [];
const n = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0;
const s = (value: unknown) => typeof value === "string" ? value : "";
const pct = (value: number) => `${(value * 100).toFixed(value * 100 < 10 ? 1 : 0)}%`;
const fmt = (value: number) => new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(value);

function provider(snapshot: Snapshot | null, key: "google" | "bing") {
  const evidence = obj(snapshot?.provider_evidence);
  return obj(evidence[key]);
}

function dailyRows(value: unknown): Point[] {
  return arr(value).map((row) => ({ date: s(row.date), clicks: n(row.clicks), impressions: n(row.impressions), ctr: row.ctr == null ? undefined : n(row.ctr), position: row.position == null ? undefined : n(row.position) })).filter((row) => row.date);
}
function dimensionRows(value: unknown): Row[] {
  return arr(value).map((row) => ({ key: s(row.key), clicks: n(row.clicks), impressions: n(row.impressions), ctr: row.ctr == null ? undefined : n(row.ctr), position: row.position == null ? undefined : n(row.position) })).filter((row) => row.key);
}

function TrendChart({ points }: { points: Point[] }) {
  if (points.length < 2) return <div className="agency-seo-empty">Run monitoring after binding Search Console or Bing to build a traffic trend.</div>;
  const width = 820, height = 220, pad = 20;
  const maxClicks = Math.max(1, ...points.map((p) => p.clicks));
  const maxImpressions = Math.max(1, ...points.map((p) => p.impressions));
  const makePath = (field: "clicks" | "impressions", max: number) => points.map((p, i) => {
    const x = pad + (i / Math.max(1, points.length - 1)) * (width - pad * 2);
    const y = height - pad - (p[field] / max) * (height - pad * 2);
    return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  return <div className="agency-seo-chart"><svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Search performance trend"><line x1={pad} x2={width-pad} y1={height-pad} y2={height-pad} className="grid-line"/><line x1={pad} x2={width-pad} y1={height/2} y2={height/2} className="grid-line"/><path d={makePath("impressions", maxImpressions)} className="line impressions"/><path d={makePath("clicks", maxClicks)} className="line clicks"/></svg><div className="chart-legend"><span><i className="legend-clicks"/>Clicks</span><span><i className="legend-impressions"/>Impressions · independent scale</span><small>{points[0]?.date} → {points.at(-1)?.date}</small></div></div>;
}

function MiniScoreTrend({ snapshots }: { snapshots: Snapshot[] }) {
  const rows = [...snapshots].reverse().slice(-12);
  if (!rows.length) return <div className="agency-seo-empty compact">No health history yet.</div>;
  return <div className="score-bars">{rows.map((row) => <div key={row.id} title={`${row.score}/100 · ${new Date(row.checked_at).toLocaleString("en-GB")}`}><span style={{ height: `${Math.max(5,row.score)}%` }}/><small>{row.score}</small></div>)}</div>;
}

function TopRows({ rows }: { rows: Row[] }) {
  if (!rows.length) return <div className="agency-seo-empty compact">No rows returned yet.</div>;
  const top = rows.slice(0, 8); const max = Math.max(1, ...top.map((row) => row.impressions));
  return <div className="agency-seo-bars">{top.map((row) => <div className="agency-seo-bar" key={row.key}><div><strong title={row.key}>{row.key}</strong><span>{fmt(row.clicks)} clicks · {fmt(row.impressions)} impr.{row.position ? ` · pos ${row.position.toFixed(1)}` : ""}</span></div><i><b style={{ width: `${Math.max(3,(row.impressions/max)*100)}%` }}/></i></div>)}</div>;
}

export default async function AgencySeoPage({ searchParams }: Props) {
  const params = await searchParams;
  const { supabase, organizationId, organization } = await requireOrganizationContext();
  const [accountsResult, sitesResult, bindingsResult, resourcesResult, snapshotsResult] = await Promise.all([
    supabase.from("crm_accounts").select("id,name,website_url,lifecycle_stage").eq("organization_id", organizationId).order("name"),
    supabase.from("agency_seo_sites").select("id,crm_account_id,name,site_url,active,created_at").eq("organization_id", organizationId).order("created_at", { ascending: false }),
    supabase.from("agency_seo_provider_bindings").select("site_id,provider_key,integration_resource_id").eq("organization_id", organizationId),
    supabase.from("integration_resources").select("id,provider_key,resource_id,resource_name,resource_type,available").eq("organization_id", organizationId).eq("available", true).in("provider_key", ["google_search_console", "bing_webmaster"]).order("provider_key").order("resource_name"),
    supabase.from("agency_seo_snapshots").select("id,site_id,checked_at,duration_ms,score,counts,checks,provider_evidence,intelligence_summary,findings,ai_reasoning,ai_model,ai_reasoning_error").eq("organization_id", organizationId).order("checked_at", { ascending: false }).limit(500),
  ]);

  const fatal = [sitesResult.error, bindingsResult.error, snapshotsResult.error].find(Boolean);
  if (fatal) return <main className="agency-seo-shell"><div className="agency-seo-banner error">Agency SEO data model is unavailable: {fatal.message}</div></main>;

  const accounts = (accountsResult.data ?? []) as Account[];
  const sites = (sitesResult.data ?? []) as Site[];
  const bindings = (bindingsResult.data ?? []) as Binding[];
  const resources = (resourcesResult.data ?? []) as Resource[];
  const snapshots = (snapshotsResult.data ?? []) as Snapshot[];
  const selectedSite = sites.find((site) => site.id === params.site) ?? sites[0] ?? null;
  const selectedSnapshots = selectedSite ? snapshots.filter((row) => row.site_id === selectedSite.id) : [];
  const latest = selectedSnapshots[0] ?? null;
  const latestBySite = new Map<string, Snapshot>();
  for (const row of snapshots) if (!latestBySite.has(row.site_id)) latestBySite.set(row.site_id, row);
  const monitoredSites = sites.filter((site) => latestBySite.has(site.id));
  const avgScore = monitoredSites.length ? Math.round(monitoredSites.reduce((sum, site) => sum + (latestBySite.get(site.id)?.score ?? 0), 0) / monitoredSites.length) : null;
  const uniqueClients = new Set(sites.map((site) => site.crm_account_id)).size;

  const google = provider(latest, "google");
  const bing = provider(latest, "bing");
  const googleDaily = dailyRows(google.daily);
  const bingDaily = dailyRows(bing.daily);
  const primaryDaily = googleDaily.length ? googleDaily : bingDaily;
  const topQueries = googleDaily.length ? dimensionRows(google.queries) : dimensionRows(bing.queries);
  const topPages = googleDaily.length ? dimensionRows(google.pages) : dimensionRows(bing.pages);
  const totalClicks = primaryDaily.reduce((sum,row)=>sum+row.clicks,0);
  const totalImpressions = primaryDaily.reduce((sum,row)=>sum+row.impressions,0);
  const weightedCtr = totalImpressions ? totalClicks / totalImpressions : 0;
  const weightedPosition = totalImpressions ? primaryDaily.reduce((sum,row)=>sum+(row.position ?? 0)*row.impressions,0)/totalImpressions : 0;
  const selectedBindings = selectedSite ? bindings.filter((item) => item.site_id === selectedSite.id) : [];
  const bindingFor = (providerKey: string) => selectedBindings.find((item) => item.provider_key === providerKey)?.integration_resource_id ?? "";
  const accountName = (accountId: string) => accounts.find((account) => account.id === accountId)?.name ?? "Client";
  const gscResources = resources.filter((resource) => resource.provider_key === "google_search_console");
  const bingResources = resources.filter((resource) => resource.provider_key === "bing_webmaster");
  const findings = arr(latest?.findings);

  return <main className="agency-seo-shell">
    <header className="agency-seo-hero"><div><p>GROW / ADVERTISING AGENCY</p><h1>Agency SEO Client Management</h1><span>Monitor client websites, bind their search properties, analyze performance and keep each client&apos;s evidence isolated inside {organization.name}.</span></div><div className="hero-actions"><Link href="/crm">CRM & Sales</Link><Link href="/integrations">Manage integrations</Link></div></header>
    {params.message ? <div className="agency-seo-banner success">{params.message}</div> : null}{params.error ? <div className="agency-seo-banner error">{params.error}</div> : null}

    <section className="agency-seo-kpis"><article><span>Clients</span><strong>{uniqueClients}</strong><small>CRM accounts with SEO sites</small></article><article><span>Websites</span><strong>{sites.length}</strong><small>{sites.filter(s=>s.active).length} active</small></article><article><span>Monitored</span><strong>{monitoredSites.length}</strong><small>With saved evidence</small></article><article><span>Portfolio health</span><strong>{avgScore == null ? "—" : `${avgScore}/100`}</strong><small>Latest score average</small></article></section>

    <section className="agency-seo-layout">
      <aside className="agency-seo-sidebar"><div className="section-heading"><div><p>PORTFOLIO</p><h2>Client websites</h2></div></div><div className="site-list">{sites.length ? sites.map((site) => { const last=latestBySite.get(site.id); return <Link href={`${PATH}?site=${site.id}`} key={site.id} className={selectedSite?.id===site.id?"site-item active":"site-item"}><div><strong>{site.name}</strong><span>{accountName(site.crm_account_id)}</span><small>{site.site_url}</small></div><b>{last ? last.score : "—"}</b></Link>; }) : <div className="agency-seo-empty compact">No client websites yet.</div>}</div></aside>

      <div className="agency-seo-main">
        <section className="agency-seo-card onboarding-card"><div className="section-heading"><div><p>ADD CLIENT WEBSITE</p><h2>Start SEO management</h2></div><span>CRM-linked</span></div><form action={createAgencySeoSite} className="agency-seo-form"><label>Existing CRM client<select name="accountId" defaultValue=""><option value="">Create a new client instead</option>{accounts.map((account)=><option value={account.id} key={account.id}>{account.name}</option>)}</select></label><label>New client name<input name="clientName" placeholder="Only needed if no CRM client is selected"/></label><label>Website URL<input name="siteUrl" placeholder="https://client.com" required/></label><label>Website label<input name="siteName" placeholder="Main website"/></label><button type="submit">Add client website</button></form></section>

        {selectedSite ? <>
          <section className="agency-seo-card site-heading-card"><div><p>{accountName(selectedSite.crm_account_id)}</p><h2>{selectedSite.name}</h2><a href={selectedSite.site_url} target="_blank" rel="noreferrer">{selectedSite.site_url} ↗</a></div><form action={runAgencySeoMonitoring}><input type="hidden" name="siteId" value={selectedSite.id}/><button className="run-button" type="submit">Run SEO monitoring</button></form></section>

          <section className="agency-seo-provider-grid">
            <article className="agency-seo-card"><div className="section-heading"><div><p>GOOGLE SEARCH CONSOLE</p><h3>Property binding</h3></div><span className={s(google.status)==="connected"?"status ok":"status"}>{latest ? s(google.status)||"unavailable" : "not run"}</span></div><form action={bindAgencySeoProvider} className="binding-form"><input type="hidden" name="siteId" value={selectedSite.id}/><input type="hidden" name="providerKey" value="google_search_console"/><select name="resourceId" defaultValue={bindingFor("google_search_console")}><option value="">No property bound</option>{gscResources.map((resource)=><option value={resource.id} key={resource.id}>{resource.resource_name || resource.resource_id}</option>)}</select><button type="submit">Save binding</button></form>{!gscResources.length?<p className="provider-note">No verified GSC properties available. <Link href="/integrations">Connect Google Search Console</Link>.</p>:null}</article>
            <article className="agency-seo-card"><div className="section-heading"><div><p>BING WEBMASTER</p><h3>Site binding</h3></div><span className={s(bing.status)==="connected"?"status ok":"status"}>{latest ? s(bing.status)||"unavailable" : "not run"}</span></div><form action={bindAgencySeoProvider} className="binding-form"><input type="hidden" name="siteId" value={selectedSite.id}/><input type="hidden" name="providerKey" value="bing_webmaster"/><select name="resourceId" defaultValue={bindingFor("bing_webmaster")}><option value="">No site bound</option>{bingResources.map((resource)=><option value={resource.id} key={resource.id}>{resource.resource_name || resource.resource_id}</option>)}</select><button type="submit">Save binding</button></form>{!bingResources.length?<p className="provider-note">No verified Bing sites available. <Link href="/integrations">Connect Bing Webmaster</Link>.</p>:null}</article>
          </section>

          <section className="agency-seo-kpis detail"><article><span>Technical health</span><strong>{latest ? `${latest.score}/100` : "—"}</strong><small>{latest ? new Date(latest.checked_at).toLocaleString("en-GB") : "Run monitoring"}</small></article><article><span>Clicks · 28d</span><strong>{latest ? fmt(totalClicks) : "—"}</strong><small>{googleDaily.length?"Google":"Bing / no Google data"}</small></article><article><span>Impressions · 28d</span><strong>{latest ? fmt(totalImpressions) : "—"}</strong><small>{latest ? `${pct(weightedCtr)} CTR` : "No snapshot"}</small></article><article><span>Avg position · 28d</span><strong>{weightedPosition ? weightedPosition.toFixed(1) : "—"}</strong><small>Impression weighted</small></article></section>

          <section className="agency-seo-card"><div className="section-heading"><div><p>SEARCH PERFORMANCE</p><h2>28-day visibility trend</h2></div><span>{googleDaily.length?"Google Search Console":bingDaily.length?"Bing Webmaster":"No provider data"}</span></div><TrendChart points={primaryDaily}/></section>

          <section className="agency-seo-two-col"><article className="agency-seo-card"><div className="section-heading"><div><p>DISCOVERY</p><h2>Top queries</h2></div></div><TopRows rows={topQueries}/></article><article className="agency-seo-card"><div className="section-heading"><div><p>CONTENT</p><h2>Top pages</h2></div></div><TopRows rows={topPages}/></article></section>

          <section className="agency-seo-two-col"><article className="agency-seo-card"><div className="section-heading"><div><p>HEALTH HISTORY</p><h2>Technical score</h2></div><span>{selectedSnapshots.length} snapshots</span></div><MiniScoreTrend snapshots={selectedSnapshots}/></article><article className="agency-seo-card"><div className="section-heading"><div><p>AI INTELLIGENCE</p><h2>Prioritized findings</h2></div><span>{findings.length} open</span></div>{findings.length?<div className="finding-list">{findings.slice(0,6).map((finding,index)=><div key={`${s(finding.id)}-${index}`}><b>{s(finding.title)||"SEO finding"}</b><span>{s(finding.severity)||"info"}</span><p>{s(finding.recommendation)||s(finding.explanation)}</p></div>)}</div>:<div className="agency-seo-empty compact">{latest ? "No deterministic SEO findings in the latest snapshot." : "Run monitoring to generate findings."}</div>}</article></section>

          <section className="agency-seo-card intelligence-card"><div className="section-heading"><div><p>SEO INTELLIGENCE AGENT</p><h2>Evidence-bound analysis</h2></div><span>{latest?.ai_model ?? (latest ? "deterministic" : "not run")}</span></div>{latest?.intelligence_summary?<p className="intelligence-summary">{latest.intelligence_summary}</p>:null}{latest?.ai_reasoning?<details><summary>Open detailed AI analysis</summary><pre>{latest.ai_reasoning}</pre></details>:<div className="agency-seo-empty compact">{latest?.ai_reasoning_error || "No AI analysis yet."}</div>}</section>
        </> : null}
      </div>
    </section>
  </main>;
}

const PATH = "/agency/seo";
