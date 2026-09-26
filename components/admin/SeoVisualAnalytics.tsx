import type { SeoDailyPoint, SeoDimensionRow, SeoProviderEvidence } from "@/lib/integrations/adapters/seo-provider-analytics";

function sum(rows: SeoDailyPoint[], key: "clicks" | "impressions") { return rows.reduce((total, row) => total + row[key], 0); }
function pct(value: number) { return `${(value * 100).toFixed(value >= 0.1 ? 1 : 2)}%`; }
function fmt(value: number) { return new Intl.NumberFormat("en-GB", { notation: value >= 10000 ? "compact" : "standard", maximumFractionDigits: 1 }).format(value); }
function delta(current: number, previous: number) { return previous === 0 ? null : ((current - previous) / previous) * 100; }
function signed(value: number | null) { if (value == null || !Number.isFinite(value)) return "—"; return `${value > 0 ? "+" : ""}${value.toFixed(1)}%`; }

function sevenDayComparison(rows: SeoDailyPoint[]) {
  const ordered = [...rows].sort((a, b) => a.date.localeCompare(b.date));
  const current = ordered.slice(-7); const previous = ordered.slice(-14, -7);
  return {
    clicks: delta(sum(current, "clicks"), sum(previous, "clicks")),
    impressions: delta(sum(current, "impressions"), sum(previous, "impressions")),
  };
}

function TrendChart({ rows }: { rows: SeoDailyPoint[] }) {
  if (!rows.length) return <p className="admin-empty">No daily search performance data is available yet.</p>;
  const data = [...rows].sort((a, b) => a.date.localeCompare(b.date));
  const width = 900, height = 250, pad = 30;
  const maxClicks = Math.max(1, ...data.map((row) => row.clicks));
  const maxImpressions = Math.max(1, ...data.map((row) => row.impressions));
  const points = (key: "clicks" | "impressions", max: number) => data.map((row, index) => {
    const x = pad + (index / Math.max(1, data.length - 1)) * (width - pad * 2);
    const y = height - pad - (row[key] / max) * (height - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  return <div style={{ overflowX: "auto" }}>
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Google Search performance trend" style={{ width: "100%", minWidth: 620, height: "auto" }}>
      {[0.25,0.5,0.75].map((p) => <line key={p} x1={pad} x2={width-pad} y1={pad+(height-pad*2)*p} y2={pad+(height-pad*2)*p} stroke="currentColor" opacity="0.10" />)}
      <polyline points={points("impressions", maxImpressions)} fill="none" stroke="currentColor" strokeWidth="3" opacity="0.35" />
      <polyline points={points("clicks", maxClicks)} fill="none" stroke="currentColor" strokeWidth="4" />
      {data.map((row, index) => {
        const x = pad + (index / Math.max(1, data.length - 1)) * (width - pad * 2);
        return index % 5 === 0 || index === data.length - 1 ? <text key={row.date} x={x} y={height - 7} fontSize="11" textAnchor="middle" fill="currentColor" opacity="0.65">{row.date.slice(5)}</text> : null;
      })}
    </svg>
    <div style={{ display: "flex", gap: 18, fontSize: 12, opacity: 0.75 }}><span><strong>━━</strong> Clicks</span><span style={{ opacity: .55 }}><strong>━━</strong> Impressions (scaled independently)</span></div>
  </div>;
}

function BarRows({ rows, metric = "clicks", limit = 10 }: { rows: SeoDimensionRow[]; metric?: "clicks" | "impressions"; limit?: number }) {
  const data = rows.slice(0, limit); const max = Math.max(1, ...data.map((row) => row[metric]));
  if (!data.length) return <p className="admin-empty">No rows available.</p>;
  return <div style={{ display: "grid", gap: 12 }}>{data.map((row) => <div key={row.key}>
    <div style={{ display: "flex", justifyContent: "space-between", gap: 16, fontSize: 13 }}><span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.key}</span><strong>{fmt(row[metric])}</strong></div>
    <div style={{ height: 8, background: "color-mix(in srgb, currentColor 10%, transparent)", borderRadius: 999, overflow: "hidden", marginTop: 5 }}><div style={{ width: `${Math.max(2, row[metric] / max * 100)}%`, height: "100%", background: "currentColor", opacity: .55, borderRadius: 999 }} /></div>
    <small style={{ opacity: .65 }}>{row.impressions ? `${fmt(row.impressions)} impressions · ${pct(row.ctr ?? row.clicks / row.impressions)} CTR${row.position ? ` · pos ${row.position.toFixed(1)}` : ""}` : "No impressions"}</small>
  </div>)}</div>;
}

export function SeoVisualAnalytics({ evidence }: { evidence: SeoProviderEvidence }) {
  const g = evidence.google; const b = evidence.bing;
  const gClicks = sum(g.daily, "clicks"), gImpressions = sum(g.daily, "impressions");
  const weightedPosition = g.daily.reduce((total, row) => total + (row.position ?? 0) * row.impressions, 0) / Math.max(1, gImpressions);
  const comparison = sevenDayComparison(g.daily);
  const inspection = g.inspection;

  return <>
    <section className="admin-metrics" aria-label="Search performance summary">
      <article><span>Google clicks · 28d</span><strong>{g.status === "connected" ? fmt(gClicks) : "—"}</strong><small>7d vs prior 7d: {signed(comparison.clicks)}</small></article>
      <article><span>Google impressions · 28d</span><strong>{g.status === "connected" ? fmt(gImpressions) : "—"}</strong><small>7d vs prior 7d: {signed(comparison.impressions)}</small></article>
      <article><span>Google CTR · 28d</span><strong>{gImpressions ? pct(gClicks / gImpressions) : "—"}</strong><small>Weighted from provider data</small></article>
      <article><span>Avg position · 28d</span><strong>{gImpressions ? weightedPosition.toFixed(1) : "—"}</strong><small>Impression-weighted</small></article>
    </section>

    <section className="admin-panel">
      <div className="admin-panel-heading"><div><p className="admin-kicker">SEARCH PERFORMANCE</p><h2>Google trend · last 28 days</h2></div><span className={`admin-status ${g.status === "connected" ? "admin-status-succeeded" : "admin-status-pending"}`}>{g.status}</span></div>
      {g.error ? <p className="form-error">{g.error}</p> : null}<TrendChart rows={g.daily} />
    </section>

    <div className="admin-grid">
      <section className="admin-panel"><div className="admin-panel-heading"><div><p className="admin-kicker">DISCOVERY</p><h2>Top queries</h2></div><span>Google</span></div><BarRows rows={g.queries} /></section>
      <section className="admin-panel"><div className="admin-panel-heading"><div><p className="admin-kicker">CONTENT</p><h2>Top pages</h2></div><span>Google</span></div><BarRows rows={g.pages} /></section>
    </div>

    <div className="admin-grid">
      <section className="admin-panel"><div className="admin-panel-heading"><div><p className="admin-kicker">AUDIENCE</p><h2>Device distribution</h2></div><span>Impressions</span></div><BarRows rows={g.devices} metric="impressions" limit={6} /></section>
      <section className="admin-panel"><div className="admin-panel-heading"><div><p className="admin-kicker">GOOGLE INDEX</p><h2>Homepage inspection</h2></div><span className={`admin-status ${inspection?.verdict === "PASS" ? "admin-status-succeeded" : "admin-status-pending"}`}>{inspection?.verdict || "unavailable"}</span></div>
        {inspection ? <div style={{ display: "grid", gap: 8 }}><p><strong>{inspection.coverageState || inspection.indexingState || "Index status returned"}</strong></p><small>Fetch: {inspection.pageFetchState || "—"}</small><small>Google canonical: {inspection.googleCanonical || "—"}</small><small>User canonical: {inspection.userCanonical || "—"}</small><small>Last crawl: {inspection.lastCrawlTime ? new Date(inspection.lastCrawlTime).toLocaleString("en-GB", { timeZone: "Europe/Budapest" }) : "—"}</small></div> : <p className="admin-empty">URL Inspection evidence was not available in this run.</p>}
      </section>
    </div>

    <section className="admin-panel">
      <div className="admin-panel-heading"><div><p className="admin-kicker">BING WEBMASTER</p><h2>Search visibility cross-check</h2></div><span className={`admin-status ${b.status === "connected" ? "admin-status-succeeded" : "admin-status-pending"}`}>{b.status}</span></div>
      {b.error ? <p className="form-error">{b.error}</p> : null}
      {b.daily.length ? <><div className="admin-metrics"><article><span>Clicks</span><strong>{fmt(sum(b.daily, "clicks"))}</strong><small>Recent Bing window</small></article><article><span>Impressions</span><strong>{fmt(sum(b.daily, "impressions"))}</strong><small>Recent Bing window</small></article><article><span>Top queries</span><strong>{b.queries.length}</strong><small>Provider rows</small></article><article><span>Top pages</span><strong>{b.pages.length}</strong><small>Provider rows</small></article></div><TrendChart rows={b.daily} /></> : <p className="admin-empty">No Bing traffic rows were returned for this snapshot.</p>}
    </section>
  </>;
}
